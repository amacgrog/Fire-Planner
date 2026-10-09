# E1d: one-time income tax treatments (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each one-time income (lump sum) a tax treatment: tax-free (default, every legacy row), wages (severance,
bonus: payroll tax), ordinary income with no payroll tax (nonqualified deferred compensation), or a long-term capital gain
with a gain share and an "Active business (no NIIT)" checkbox; each taxable lump has an owner and pays its own tax inside
the year's cash flow.

**Architecture:** A pure splitter `lumpAmountsForYear(lumps, ctx, out)` (scratch `LUMP_OUT`, beside
`streamAmountsForYear`) turns the year's rows into per-owner wages, ordinary and gain amounts plus a tax-free total. The
tax-free total keeps today's `bal.cash += oneTimeAmount` path bit for bit; the taxable total (`flowTotal`, the one gate)
enters `wages`. Wages and ordinary lumps ride the existing `streamWagesA/B` / `streamOtherA/B` arguments; gains ride new
profile fields (`lumpOn`, `lumpGainA/B`, `lumpGainNoNiitA/B`) read in each `taxFor` branch, `returnMagis` and `magiBase0`.
A lump year records no guardrail withdrawal and clears the last record after its own step.

**Tech Stack:** `Planner_US.html` (one inline `<script>` IIFE, no build), Node + Playwright tests (`tests/*.js`,
`test_*.js`).

**Spec:** `docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md` at `537a30f` (read it first, including
decisions 1-11 and section 12; this plan argues from it). Background: `CLAUDE.md` ("MAGI iteration (both engines)", "Per-year
helpers", "Add-as-you-go lists", "Income streams, owner and kind (US, E1b)", "Self-employment (US, E1c)", "Testing
checklist"); the E1b plan `docs/superpowers/plans/2026-10-08-e1b-income-streams.md` and `tests/income_streams.js` for the
stream code and test boilerplate this plan mirrors.

## Global Constraints

- Worktrees: `git -C C:\Users\Alex\code\Fire-Planner worktree add ../fp-e1d -b claude/e1d-one-time-income PLAN_COMMIT`
  (PLAN_COMMIT = the commit that adds this plan); baseline `git -C C:\Users\Alex\code\Fire-Planner worktree add --detach
  ../fp-e1d-base 14dde9a` (the planner code at PLAN_COMMIT is identical to `14dde9a`). Link `node_modules` into each as a
  directory junction from `../fp-e1b` (`cmd /c mklink /J node_modules ..\fp-e1b\node_modules` inside the worktree).
- Never edit, stash, check out, reset or commit in `C:\Users\Alex\code\Fire-Planner` (the owner's checkout and stashes).
  Never push, open a PR or merge.
- **US only.** No change to `Planner_Canada.html`, `shared/`, or any `@@shared` region. Every edit site below is outside
  every `@@shared:... begin/end` pair (check before editing; `normalizeLists` IS inside `01-LIST_MAX` and must not change).
  `npm run check:shared` prints OK at every commit. Never run `npm run sync`.
- `npm test` green at every commit.
- **Exactness:** no existing entry of `tests/snapshots/us.json` or `canada.json` may change in any commit. Tasks 1-3 add no
  snapshot scenario: `node tests/snapshot.js` must pass against the committed baseline after each of them; on a difference,
  stop and find the changed sum order, never update. Task 4 adds new scenarios: the json diff shows added entries only.
  Every new term is skipped (not added) outside a lump year, or appended AFTER today's terms (`x + 0` leaves a double
  unchanged; inserting a term in the middle of a sum does not).
- `tests/snapshots/legacy_state.json` changes only in Task 1 (new keys on `oneTimeIncome` rows and new corpus cases), and the
  commit message says so. `ui_us.json` must not change (the DYN rows are outside `snapshot_ui.js` and `field_registry.js`
  by design: both skip `[data-dyn-list]`); if it changes, stop and report.
- No heuristic, gate or threshold the spec does not name.
- **Timing** (Tasks 2, 3, 4): `node tests/bench_runs_interleaved.js --base ../fp-e1d-base --rounds 21`, at most +5% per path,
  the median of three runs on a quiet machine (never while another chat runs probes on this machine). Report the tables
  verbatim.
- Each commit: only your paths, `git commit -m "..." -- <paths>` (`git add` new files first), message ending
  `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- Ledger and task reports in `.superpowers/sdd/2026-10-09-e1d/` inside the worktree (git-excluded).
- Shell: never put Markdown backticks inside a double-quoted shell string; write text to a file and insert it with a small
  node script. The tree is CRLF; never use `sed -i` on any tracked file (it strips CRLF); edit with the Edit tool or node.
- Tests are written FIRST and run red (each task's Step 2); record the red output in the task report.
- Line numbers below are at `14dde9a` and drift as you edit; find each site by the quoted code.

## Review Focus

1. **A lump row loaded without normalization** (`Object.assign`, as `tests/snapshot.js` does; no `kind`, no `owner`, no
   `gainPct`): it is tax-free, owner A, and gives today's numbers bit for bit. Task 2, Step 1 (cases `raw row` and
   `raw-row exactness`).
2. **Two lumps in the same year with different kinds and owners** (a severance for A and a gain for B in a two-return
   year): each part reaches its own return and the cash adds up. Task 2, Step 1 (case `mixed kinds`) and Task 3, Step 1
   (the two-filer equivalence: A's and B's gains on their own returns).
3. **A gain lump with `gainPct` 0 or a non-number (`'x'`, `null`) left in the row by an old edit:** 0 is all basis (tax-free,
   no lump year); a non-number reads as 100. Task 2, Step 1 (cases `gainPct 0` and `gainPct junk`).
4. **A lump in single-person mode with a stored owner `'B'`:** taxed on A's return. Task 2, Step 1 (case `single stored B`).
5. **A lump in the year of the owner's death:** wages and ordinary go to the survivor without payroll tax; a gain is
   tax-free (decision 10). Task 2, Step 1 (case `death year`) and Task 2, Step 5 (engine case `dead owner`).

---

### Task 1: Inputs and normalization (US; no number change)

**Files:**
- Modify: `Planner_US.html`: `defaults` (`oneTimeIncome: []`, ~944, unchanged), a new `normalizeUsLumps` just below
  `normalizeUsStreams` (~1145-1166) and its call next to `normalizeUsStreams(s, raw);` (~1364), `DYN.oneTimeIncome`
  (~14699-14723).
- Modify: `tests/legacy_state.js` (corpus), `tests/snapshots/legacy_state.json` (regenerated).
- Create: `test_lump_income.js` (repo root, Playwright, not in CI).

**Interfaces:**
- Produces: normalized rows `{ amount, age, flat, kind: 'free'|'wages'|'ordinary'|'gain', owner: 'A'|'B', gainPct: number
  0-100, activeBusiness: boolean }`; DYN ids `oneTime<i>Kind`, `oneTime<i>Owner`, `oneTime<i>GainPct`,
  `oneTime<i>ActiveBusiness` (the shared renderer's `<prefix><index><Field>` scheme; confirm by reading
  `renderDynList` in `23-dynFieldHtml`, do not edit it).

- [ ] **Step 1: Write the failing tests**

In `tests/legacy_state.js`, add these corpus cases next to the `'stream ...'` cases (~line 68):

```js
  'lump kinds': { oneTimeIncome: [
    { amount: 50000, age: 60, flat: true, kind: 'wages', owner: 'B' },
    { amount: 20000, age: 61, flat: false, kind: 'ordinary', owner: 'A' },
    { amount: 300000, age: 62, flat: true, kind: 'gain', owner: 'B', gainPct: 40, activeBusiness: true },
  ] },
  'lump junk': { oneTimeIncome: [
    { amount: 1000, age: 60, kind: 'inherited', owner: 'b', gainPct: -5, activeBusiness: 'yes' },
    { amount: 1000, age: 61, kind: 'gain', gainPct: 250 },
    { amount: 1000, age: 62, kind: 'gain', gainPct: 'x' },
    { amount: 1000, age: 63 },
  ] },
  'lump legacy flag': { otherIncomeEnabled: true, oneTimeIncome: [
    { enabled: true, amount: 5000, age: 60, kind: 'wages', owner: 'B' },
    { enabled: false, amount: 9, age: 61 },
  ] },
```

Expected normalized rows (assert these explicitly in the test, beside the pinned snapshot, with a small helper that reads
`state.oneTimeIncome` after `__test_replaceState`):
- `lump kinds`: `[{ amount: 50000, age: 60, flat: true, kind: 'wages', owner: 'B', gainPct: 100, activeBusiness: false },
  { amount: 20000, age: 61, flat: false, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false },
  { amount: 300000, age: 62, flat: true, kind: 'gain', owner: 'B', gainPct: 40, activeBusiness: true }]`.
- `lump junk`: kinds `['free', 'gain', 'gain', 'free']`, owners all `'A'`, gainPct `[0, 100, 100, 100]`, activeBusiness all
  `false`.
- `lump legacy flag`: one row `{ amount: 5000, age: 60, flat: false, kind: 'free', owner: 'A', gainPct: 100,
  activeBusiness: false }` (a legacy save ignores the raw keys, E1b's rule).

Create `test_lump_income.js` (model it on `test_income_streams.js`): load `Planner_US.html` (clock pinned to
2026-06-15), open `#otherIncomeGroup`, click the "+ Add a one-time income" button, then assert:

```js
  // fresh row: kind free; owner, gain share and checkbox hidden
  assert.strictEqual(await page.$eval('#oneTime0Kind', (e) => e.value), 'free');
  for (const id of ['oneTime0Owner', 'oneTime0GainPct', 'oneTime0ActiveBusiness'])
    assert(!(await page.isVisible('#' + id)), id + ' hidden for a tax-free row');
  await page.selectOption('#oneTime0Kind', 'wages');
  assert(await page.isVisible('#oneTime0Owner'), 'owner shown for wages (couple)');
  assert(!(await page.isVisible('#oneTime0GainPct')), 'gain share hidden for wages');
  await page.selectOption('#oneTime0Kind', 'gain');
  for (const id of ['oneTime0Owner', 'oneTime0GainPct', 'oneTime0ActiveBusiness'])
    assert(await page.isVisible('#' + id), id + ' shown for a gain row');
  // single-person mode hides the owner
  await setCheck('singlePerson', true); // the helper test_income_streams.js defines (~line 62): copy it
  assert(!(await page.isVisible('#oneTime0Owner')), 'owner hidden in single-person mode');
  await setCheck('singlePerson', false);
  // reload round trip: the row keeps kind, owner, gain share and checkbox through export -> import (or autosave -> reload,
  // whichever test_income_streams.js uses)
  // the mobile check: scrollWidth <= clientWidth at 390 x 844 with the gain row open
```

Write the round-trip and mobile assertions concretely by copying the matching blocks of `test_income_streams.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/legacy_state.js` (expect FAIL: the new cases' explicit asserts see no `kind` key) and
`node test_lump_income.js` (expect FAIL: `#oneTime0Kind` not found). Record both outputs.

- [ ] **Step 3: Implement**

`normalizeUsLumps`, just below `normalizeUsStreams` (outside `01-LIST_MAX`):

```js
  // E1d: one-time income tax treatment and owner (US). normalizeLists (shared) keeps only amount, age and flat, so these
  // are read from the raw save, aligned exactly as normalizeUsStreams aligns streams (a legacy save ignores the raw keys).
  // Unknown values fall back to the legacy meaning: tax-free, Partner A.
  function normalizeUsLumps(s, raw) {
    const legacy = !!raw && 'otherIncomeEnabled' in raw,
      src = !legacy && Array.isArray(raw?.oneTimeIncome) ? raw.oneTimeIncome.filter((x) => x && typeof x === 'object') : [];
    s.oneTimeIncome = s.oneTimeIncome.map((x, i) => {
      const r = src[i] || {};
      const g = r.gainPct !== '' && r.gainPct !== null && Number.isFinite(Number(r.gainPct)) ? Math.min(100, Math.max(0, Number(r.gainPct))) : 100;
      return {
        ...x,
        kind: r.kind === 'wages' || r.kind === 'ordinary' || r.kind === 'gain' ? r.kind : 'free',
        owner: r.owner === 'B' ? 'B' : 'A',
        gainPct: g,
        activeBusiness: r.activeBusiness === true,
      };
    });
  }
```

Call it right after `normalizeUsStreams(s, raw);` (~1364): `normalizeUsLumps(s, raw);`.

`DYN.oneTimeIncome`: replace `note`, `tip` and `fresh`, and insert the new fields after `amount`:

```js
      note: 'Lump sums received at a specific age, each with its own tax treatment.',
      tip: "Tax-free lumps (an inheritance of cash, investments or a house, whose basis steps up to the value at death; life insurance; a gift received; a home-sale gain within the $250,000 / $500,000 exclusion ($500,000 also for a surviving spouse selling within two years); a sale at cost) are added to cash. Taxable lumps are income of the year received and pay their own tax first. Amounts are in today's dollars and adjusted for inflation to that year unless you check 'Fixed amount'.",
      fresh: () => ({ amount: 0, age: 65, flat: false, kind: 'free', owner: 'A', gainPct: 100, activeBusiness: false }),
      fields: [
        { key: 'amount', kind: 'money', label: 'Lump sum amount', short: "Today's dollars unless fixed below", step: 1000 },
        {
          key: 'kind', kind: 'select', label: 'Tax treatment',
          options: [['free', 'Tax-free'], ['wages', 'Wages (severance, bonus)'], ['ordinary', 'Ordinary income, no payroll tax'], ['gain', 'Long-term capital gain']],
          tip: "Wages: severance or a bonus; taxed on the owner's return with Social Security and Medicare tax (sharing the owner's wage base with their salary); counts as earned income for the child tax credit; no 401(k) or IRA contribution is made from it. Ordinary income, no payroll tax: nonqualified deferred compensation (its payroll tax was normally paid when it vested) or similar compensation, a taxable prize or award; not a pension or annuity payout (not modeled). Long-term capital gain: the sale of a business, a rental or other property held over a year; only the gain share is taxed, at long-term rates; the state taxes it as it taxes investment gains, with no rule for real estate or a business (Washington's capital gains tax excludes real estate, but the planner charges it); a part taxed as ordinary income (depreciation recapture, inventory) goes in a separate ordinary lump. If the owner has died (in that year or earlier), wages and ordinary income are taxed to the survivor without payroll tax, and a gain is tax-free (the basis of an asset the owner held alone steps up at death). Every kind raises the year's income for the ACA premium credit and, two years on, IRMAA.",
        },
        { key: 'owner', kind: 'select', label: 'Owner', options: [['A', 'Partner A'], ['B', 'Partner B']], showIf: (it) => !state.singlePerson && (it.kind === 'wages' || it.kind === 'ordinary' || it.kind === 'gain') },
        {
          key: 'gainPct', kind: 'num', label: 'Gain share of the amount, %', min: 0, max: 100, step: 1, showIf: (it) => it.kind === 'gain',
          tip: 'The sale price less the basis (what was paid plus improvements, less depreciation), as a share of the amount; the rest comes back tax-free.',
        },
        {
          key: 'activeBusiness', kind: 'check', label: 'Active business (no NIIT)', showIf: (it) => it.kind === 'gain',
          tip: 'Tick for the sale of a business you actively run (or your interest in a partnership or S corporation that runs one): the 3.8% net investment income tax does not apply to that gain. Leave it unticked for a rental, a passive investment or other property; the gain still counts as income for the tax\'s threshold, the ACA and IRMAA.',
        },
        { key: 'age', kind: 'num', label: 'Received at Partner A age', min: 18, max: 100, step: 1 },
        // (the existing `flat` field, unchanged)
```

Keep the existing `age` and `flat` field objects as they are (only move nothing else). If the shared renderer's `num`
field does not clamp to `min`/`max` on input, add nothing: the engine clamps `gainPct` itself (Task 2), and
`normalizeUsLumps` clamps on load.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node tests/legacy_state.js` (the explicit asserts pass; the pinned snapshot now differs only by the new keys on
`oneTimeIncome` rows and the new cases: inspect the diff, then regenerate with the script's update flag, the one
`tests/legacy_state.js` documents at its top) and `node test_lump_income.js` (PASS), then `npm test` (green;
`snapshot.js` and `snapshot_ui.js` unchanged), `npm run check:shared` (OK).

- [ ] **Step 5: Commit**

```bash
git add test_lump_income.js
git commit -m "E1d 1: one-time income tax treatment and owner inputs, normalizeUsLumps (legacy_state.json: new keys on oneTimeIncome rows and three corpus cases; no number change)" -- Planner_US.html tests/legacy_state.js tests/snapshots/legacy_state.json test_lump_income.js
```

---

### Task 2: The splitter, the cash flow, wages and ordinary lumps, guardrails (US; no existing number change)

**Files:**
- Modify: `Planner_US.html`: a new `LUMP_OUT` + `lumpAmountsForYear` just below `streamAmountsForYear` (~10140);
  `listAmountsForYear` (~10143-10160); the year loop: the `listAmountsForYear` call (~10437), the two `selfEmploymentTax`
  calls (~10450, ~10454), the `wages` line (~10462), the `buildTaxProfile` call (~10495), `payrollTax` (~10844), the
  multiplier step (~10810-10813), the deficit branch's record (~10917-10918), the forced pass's record (~11109-11111), the
  trace entry (~11329); test hooks near `window.__test_streamAmountsForYear` (~17009).
- Create: `tests/lump_income.js`; add it to `package.json`'s `test` script right after `node tests/qbi.js`.

**Interfaces:**
- Consumes: Task 1's row shape (but reads raw rows defensively, spec section 5.2).
- Produces: `LUMP_OUT = { taxFree, wagesA, wagesB, otherA, otherB, gainA, gainB, gainNoNiitA, gainNoNiitB, flowTotal }`;
  `lumpAmountsForYear(lumps, ctx, out)` (ctx = `STREAM_CTX`: `ageA`, `deadA`, `deadB`, `single`, `factor`);
  `listAmountsForYear` returns `lumps: LUMP_OUT` beside `oneTimeAmount` (= `LUMP_OUT.taxFree`); year-loop locals
  `lumpYear` (boolean), `lumpWagesA/B`, `lumpOtherA/B`, `lumpGainA/B`, `lumpNoNiitA/B`, `lumpFlow`;
  `window.__test_lumpAmountsForYear(lumps, ctx)` (returns a plain copy); trace entries gain `guardrails`,
  `firstWithdrawal`, `forcedPass`. Task 3 consumes `lumpGainA/B`, `lumpNoNiitA/B`, `lumpYear`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lump_income.js` with the boilerplate of `tests/income_streams.js` (chromium, clock pinned to
2026-06-15T12:00:00Z, `pageerror` collected, `near`). Pure-function cases:

```js
  const L = (o) => ({ amount: 10000, age: 60, flat: true, kind: 'free', owner: 'A', gainPct: 100, activeBusiness: false, ...o });
  const ctx0 = { ageA: 60, ageB: 58, deadA: false, deadB: false, single: false, year: 0, factor: 1.1, incomeFactor: 1 };
  const fn = (lumps, c = {}) => page.evaluate(([l, x]) => window.__test_lumpAmountsForYear(l, x), [lumps, { ...ctx0, ...c }]);
  const Z = { taxFree: 0, wagesA: 0, wagesB: 0, otherA: 0, otherB: 0, gainA: 0, gainB: 0, gainNoNiitA: 0, gainNoNiitB: 0, flowTotal: 0 };
  const is = (r, o, msg) => assert.deepStrictEqual(r, { ...Z, ...o }, msg);

  is(await fn([L({})]), { taxFree: 10000 }, 'free, flat');
  is(await fn([L({ flat: false })]), { taxFree: 11000 }, 'free, inflated by factor 1.1');
  is(await fn([L({ age: 61 })]), {}, 'not this age');
  is(await fn([L({ age: 59.6 })]), { taxFree: 10000 }, 'age rounds (Math.round(59.6) = 60)');
  is(await fn([{ amount: 10000, age: 60, flat: true }]), { taxFree: 10000 }, 'raw row (no kind, no owner) is tax-free');
  is(await fn([L({ kind: 'wages' })]), { wagesA: 10000, flowTotal: 10000 }, 'wages A');
  is(await fn([L({ kind: 'wages', owner: 'B' })]), { wagesB: 10000, flowTotal: 10000 }, 'wages B');
  is(await fn([L({ kind: 'ordinary', owner: 'B' })]), { otherB: 10000, flowTotal: 10000 }, 'ordinary B');
  is(await fn([L({ kind: 'wages', owner: 'b' })]), { wagesA: 10000, flowTotal: 10000 }, "owner 'b' reads as A");
  is(await fn([L({ kind: 'gain', gainPct: 40 })]), { gainA: 4000, taxFree: 6000, flowTotal: 4000 }, 'gain 40%: basis to taxFree');
  is(await fn([L({ kind: 'gain', gainPct: 0 })]), { taxFree: 10000 }, 'gainPct 0: all basis, no lump year');
  is(await fn([L({ kind: 'gain', gainPct: 'x' })]), { gainA: 10000, flowTotal: 10000 }, 'gainPct junk reads as 100');
  is(await fn([L({ kind: 'gain', gainPct: 250 })]), { gainA: 10000, flowTotal: 10000 }, 'gainPct clamped to 100');
  is(await fn([L({ kind: 'gain', owner: 'B', activeBusiness: true })]), { gainB: 10000, gainNoNiitB: 10000, flowTotal: 10000 }, 'active business B');
  is(await fn([L({ kind: 'gain', activeBusiness: 'yes' })]), { gainA: 10000, flowTotal: 10000 }, "activeBusiness 'yes' is not true");
  is(await fn([L({ kind: 'wages', owner: 'B' })], { single: true }), { wagesA: 10000, flowTotal: 10000 }, 'single stored B: A');
  // death year / dead owner (decision 10: deadX is true from the death year on)
  is(await fn([L({ kind: 'wages' })], { deadA: true }), { otherB: 10000, flowTotal: 10000 }, "death year: A's wages to B, no payroll");
  is(await fn([L({ kind: 'ordinary' })], { deadA: true }), { otherB: 10000, flowTotal: 10000 }, "A's ordinary to B");
  is(await fn([L({ kind: 'wages', owner: 'B' })], { deadB: true }), { otherA: 10000, flowTotal: 10000 }, "B's wages to A");
  is(await fn([L({ kind: 'gain', gainPct: 40 })], { deadA: true }), { taxFree: 10000 }, "dead owner's gain: stepped up, all tax-free");
  is(await fn([L({ kind: 'wages', owner: 'B' })], { deadA: true }), { wagesB: 10000, flowTotal: 10000 }, "survivor's own wages");
  // mixed kinds in one year, list order
  is(
    await fn([L({ kind: 'wages' }), L({ kind: 'gain', owner: 'B', gainPct: 50, amount: 30000 }), L({ amount: 5000 }), L({ kind: 'ordinary', amount: 2000 })]),
    { wagesA: 10000, gainB: 15000, otherA: 2000, taxFree: 20000, flowTotal: 27000 },
    'mixed kinds',
  );
```

Exactness of the tax-free total against today's expression (several free rows, inflated and flat, non-round amounts, and
some at other ages): evaluate in the page

```js
  const exact = await page.evaluate(([rows, c]) => {
    const out = window.__test_lumpAmountsForYear(rows, c);
    const old = rows.filter((o) => Math.round(o.age) === c.ageA).reduce((sum, o) => sum + o.amount * (o.flat ? 1 : c.factor), 0);
    return { same: Object.is(out.taxFree, old), a: out.taxFree, b: old };
  }, [[{ amount: 12345.67, age: 60 }, { amount: 999.99, age: 60, flat: true }, { amount: 50000, age: 61 }, { amount: 3333.33, age: 60.4 }], { ...ctx0, factor: 1.2189 }]);
  assert(exact.same, `raw-row exactness: ${exact.a} vs ${exact.b}`);
```

Engine cases (helper `engine(patch, lumps)` that saves state, `Object.assign`s the patch with `oneTimeIncome: lumps`, runs
`window.__test_accountTrace()` and `window.__test_simulate()`, restores state, and returns per year `ficaTax`,
`profile.wageA/wageB/extraA/extraB`, `guardrails`, `firstWithdrawal`, `forcedPass` from the trace and `wages`, `tax`,
`investable`, `baseSpend`, `magiProxy`, `healthcare` from the rows, plus `sim.firstWithdrawal`). Base household `W`:
`{ singlePerson: true, ageA: 45, retireAgeA: 60, lifeExpectancyA: 90, incomeA: 100000, incomeKindA: 'wages', inflation: 0,
incomeGrowth: 0, stateTax: 'tx', k401PctA: 0, catchupPctA: 0, iraPctA: 0, profitSharingPctA: 0, megaBackdoor: false,
healthPremiumA: 0, survivorEnabled: false, incomeSources: [], spending: 40000, guardrailsEnabled: false, acaEnabled: false,
children: [] }`.

```js
  // severance, under the wage base: payroll +7.65% of 50,000 = 3,825 (2026 wage base 184,500)
  let a = await engine(W, []), b = await engine(W, [L({ age: 45, amount: 50000, kind: 'wages' })]);
  near(b.trace[0].ficaTax - a.trace[0].ficaTax, 3825, 1e-6, 'severance: payroll tax');
  near(b.trace[0].profile.wageA - a.trace[0].profile.wageA, 50000, 1e-6, 'severance: profile wage');
  near(b.rows[0].wages - a.rows[0].wages, 50000, 1e-6, 'severance in the flow (row.wages)');
  // shared wage base: salary 160,000 + 50,000 = 210,000 single: SS 184,500 x 6.2% = 11,439; Medicare 3,045; AMT (210,000 - 200,000) x 0.9% = 90
  a = await engine({ ...W, incomeA: 160000 }, []); b = await engine({ ...W, incomeA: 160000 }, [L({ age: 45, amount: 50000, kind: 'wages' })]);
  near(a.trace[0].ficaTax, 12240, 1e-6, 'salary alone: 160,000 x 7.65%');
  near(b.trace[0].ficaTax, 14574, 1e-6, 'severance shares the wage base');
  // deferred compensation: no payroll tax, the same income tax as the wages kind (W at income 100,000)
  const none = await engine(W, []),
    wRun = await engine(W, [L({ age: 45, amount: 50000, kind: 'wages' })]),
    oRun = await engine(W, [L({ age: 45, amount: 50000, kind: 'ordinary' })]);
  assert.strictEqual(oRun.trace[0].ficaTax, none.trace[0].ficaTax, 'ordinary: no payroll tax');
  near(oRun.trace[0].profile.extraA, 50000, 1e-6, 'ordinary in extraA');
  assert.strictEqual(oRun.trace[0].profile.wageA, none.trace[0].profile.wageA, 'ordinary is not a wage');
  near(wRun.rows[0].tax - wRun.trace[0].ficaTax, oRun.rows[0].tax - oRun.trace[0].ficaTax, 1e-6, 'same income tax');

  // self-employed owner with a wages lump: SE Social Security only on the base left (184,500 - 150,000 = 34,500)
  // ne = 100,000 x 0.9235 = 92,350; SE = 34,500 x 12.4% + 92,350 x 2.9% = 4,278 + 2,678.15 = 6,956.15;
  // W-2 FICA 150,000 x 7.65% = 11,475; AMT (150,000 + 92,350 - 200,000) x 0.9% = 381.15; total 18,812.30
  const se = await engine({ ...W, incomeKindA: 'self' }, [L({ age: 45, amount: 150000, kind: 'wages' })]);
  near(se.trace[0].ficaTax, 18812.3, 1e-6, 'SE wage base used up by the severance');
  // owner B in a two-return year: B's payroll tax and wage base; the ACTC stays on A
  //   (W as a couple, filingStatus 'single', incomeB 160,000, a child born 2020: B's lump 50,000 -> B's FICA as above 14,574;
  //    A's wage and A's credit unchanged against the run without the lump)
  // cash conservation in a working surplus year (standard mode, no ACA or IRMAA line in reach):
  const free = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 50000, kind: 'free' })]);
  const wag = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 50000, kind: 'wages' })]);
  near(wag.rows[0].investable, free.rows[0].investable - (wag.rows[0].tax - free.rows[0].tax), 0.01, 'cash conservation: wages');
  const g0 = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 50000, kind: 'gain', gainPct: 0 })]);
  assert.deepStrictEqual(g0.rows, free.rows, 'gainPct 0 is exactly the tax-free run');
```

Owner B in a two-return year, concretely:

```js
  // a couple filing as two single returns, B earns 160,000; B's severance 50,000: B's FICA rises from 12,240 to 14,574
  // (the shared-base arithmetic above), A's wage and A's return are untouched, and the child credit stays on A
  const C2 = { ...W, singlePerson: false, ageB: 45, retireAgeB: 60, lifeExpectancyB: 90, incomeB: 160000, incomeKindB: 'wages',
    k401PctB: 0, catchupPctB: 0, iraPctB: 0, profitSharingPctB: 0, healthPremiumB: 0, filingStatus: 'single',
    children: [{ birthYear: 2020, student: false }] };
  const c0 = await engine(C2, []), cB = await engine(C2, [L({ age: 45, amount: 50000, kind: 'wages', owner: 'B' })]);
  near(cB.trace[0].ficaTax - c0.trace[0].ficaTax, 14574 - 12240, 1e-6, "B's payroll tax on B's wage base");
  assert.strictEqual(cB.trace[0].profile.wageA, c0.trace[0].profile.wageA, "A's wage untouched");
  near(cB.trace[0].profile.wageB - c0.trace[0].profile.wageB, 50000, 1e-6, "B's wage");
  // A's return alone (taxFor on a two-filer profile is A's + B's): the credit on A is the same with and without B's lump
  const credA = await page.evaluate(([p0, p1]) => {
    const t = window.__test_tax;
    return [t.childCredits(p0.dependents, 'hoh', 0, p0.otherA, 1e9, p0.wageA), t.childCredits(p1.dependents, 'hoh', 0, p1.otherA, 1e9, p1.wageA)];
  }, [c0.trace[0].profile, cB.trace[0].profile]);
  assert.deepStrictEqual(credA[0], credA[1], "A's child credit unchanged by B's lump");
```

(The `engine` helper must return `profile` with `dependents` and `otherA`; `childCredits`' signature is
`(dependents, filing, yearIndex, magi, federalTax, earnedIncome)`. If a value needs a figure this plan does not give,
compute it by hand in a comment first, then assert it.)

Guardrail cases (decisions 7 and 11). Base `G`: `{ singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 90,
incomeA: 0, inflation: 0, stateTax: 'tx', acaEnabled: false, medicareYearly: 0, ssMonthlyA: 0, tenure: 'rent', rent: 0,
taxable: 600000, cash: 0, cashReserve: 0, bondYears: 0, tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0, spending:
30000, guardrailsEnabled: true, survivorEnabled: false, incomeSources: [], children: [] }` (set the remaining account keys
to 0 as `tests/aca_medicaid.js`'s guard case does).

```js
  // lump in the retirement year (year 0): no record that year, the baseline from the first deficit year without a lump
  const r0 = await engine(G, [L({ age: 60, amount: 20000, kind: 'wages' })]);
  assert.strictEqual(r0.trace[0].guardrails.initialWR, null, 'no baseline in the lump year');
  assert.notStrictEqual(r0.trace[1].guardrails.initialWR, null, 'baseline from year 1');
  assert.strictEqual(r0.sim.firstWithdrawal, 0, 'firstWithdrawal stays 0 (decision 7)');
  // a later lump after a year whose record steps the multiplier: spending doubles at 63 (a spending tier), so the
  // record at 63 is above 1.2 x the baseline; the lump at 64
  const tiers = [{ amount: 60000, startAge: 63, endAge: 120, followGrowth: true, growth: 0 }];
  const r1 = await engine({ ...G, spendingTiers: tiers }, [L({ age: 64, amount: 20000, kind: 'wages' })]);
  const m = (r, i) => r.trace[i].guardrails.multiplier;
  assert.strictEqual(m(r1, 3), 1, 'year 63 (index 3) still at 1 (its step reads year 62)');
  near(m(r1, 4), 0.9, 1e-12, 'the lump year steps from year 63 (not cleared before the step)');
  assert.strictEqual(r1.trace[4].guardrails.prevPortfolio, null, 'the lump year clears the record');
  near(m(r1, 5), 0.9, 1e-12, 'the year after holds (a second step would give 0.81)');
  // forced pass: the aca_medicaid guard household with guardrails on; scan ordinary lumps of 50, 100, ..., 2,000 at ages
  // 59-64 for a lump year that runs the forced pass, then check nothing was recorded that year
  const fp = await page.evaluate((base) => {
    const s = window.__test_getState(), saved = JSON.parse(JSON.stringify(s));
    try {
      for (let age = 59; age <= 64; age++)
        for (let amt = 50; amt <= 2000; amt += 50) {
          for (const k of Object.keys(s)) delete s[k];
          Object.assign(s, JSON.parse(JSON.stringify(saved)), base, { oneTimeIncome: [{ amount: amt, age, flat: true, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false }] });
          const tr = window.__test_accountTrace(), i = age - 58;
          if (tr[i].forcedPass) return { found: true, age, amt, prev: tr[i - 1].guardrails, cur: tr[i].guardrails };
        }
      return { found: false };
    } finally { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, saved); }
  }, { ...A0, guardrailsEnabled: true });
  assert(fp.found, 'a lump year that runs the forced pass (widen the scan if this fails, and report)');
  assert.strictEqual(fp.cur.initialWR, fp.prev.initialWR, 'forced lump year: no baseline change');
  assert.strictEqual(fp.cur.prevPortfolio, null, 'forced lump year: no record');
```

`A0` is the ACA household defined in Task 3's tests; define it in Task 2 instead (move it up) so both tasks use it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/lump_income.js`. Expected: FAIL at the first case (`window.__test_lumpAmountsForYear is not a function`).
Record the output.

- [ ] **Step 3: Implement the splitter and its hook**

Below `streamAmountsForYear` (outside every shared region):

```js
  // E1d: this year's one-time income split by kind and owner. Pure (reads no state). Any kind but wages, ordinary or gain is
  // tax-free and any owner but 'B' is A (rows may arrive unnormalized); owner A in single-person mode. A dead owner's
  // wages or ordinary income goes to the living partner as ordinary income (no payroll tax); a dead owner's gain is
  // tax-free (stepped-up basis); the owner is dead from the death year on. Only the gain share of a gain row is taxable;
  // its basis joins taxFree. flowTotal (the taxable part) is the one gate: a lump year is flowTotal > 0. taxFree runs from
  // 0 in list order: for all-free rows it is the old oneTimeAmount, bit for bit.
  const LUMP_OUT = { taxFree: 0, wagesA: 0, wagesB: 0, otherA: 0, otherB: 0, gainA: 0, gainB: 0, gainNoNiitA: 0, gainNoNiitB: 0, flowTotal: 0 };
  function lumpAmountsForYear(lumps, ctx, out) {
    out.taxFree = 0; out.wagesA = 0; out.wagesB = 0; out.otherA = 0; out.otherB = 0;
    out.gainA = 0; out.gainB = 0; out.gainNoNiitA = 0; out.gainNoNiitB = 0; out.flowTotal = 0;
    for (let i = 0; i < lumps.length; i++) {
      const o = lumps[i];
      if (Math.round(o.age) !== ctx.ageA) continue;
      const amt = o.amount * (o.flat ? 1 : ctx.factor),
        k = o.kind;
      if (k !== 'wages' && k !== 'ordinary' && k !== 'gain') {
        out.taxFree += amt;
        continue;
      }
      const b = !ctx.single && o.owner === 'B',
        dead = b ? ctx.deadB : ctx.deadA;
      if (k === 'gain') {
        if (dead) {
          out.taxFree += amt;
          continue;
        }
        const p = o.gainPct !== '' && o.gainPct !== null && Number.isFinite(Number(o.gainPct)) ? Math.min(100, Math.max(0, Number(o.gainPct))) : 100,
          g = (amt * p) / 100;
        if (b) out.gainB += g; else out.gainA += g;
        if (o.activeBusiness === true) { if (b) out.gainNoNiitB += g; else out.gainNoNiitA += g; }
        out.taxFree += amt - g;
        out.flowTotal += g;
      } else {
        if (k === 'wages' && !dead) { if (b) out.wagesB += amt; else out.wagesA += amt; }
        else if (b !== dead) out.otherB += amt; // owner B alive, or owner A dead: the money is B's
        else out.otherA += amt;
        out.flowTotal += amt;
      }
    }
    return out;
  }
```

Note the case `gain 40%` expects `taxFree: 6000` and `gainA: 4000` exactly: `10000 * 40 / 100 = 4000` and
`10000 - 4000 = 6000` are exact doubles. Keep `(amt * p) / 100` in that order.

`listAmountsForYear`: replace the `oneTimeAmount` reduce with

```js
    const lumps = lumpAmountsForYear(state.oneTimeIncome, STREAM_CTX, LUMP_OUT),
      oneTimeAmount = lumps.taxFree;
```

and return `{ extraIncome, streams, lumps, oneTimeAmount, extraExpense, lumpExpense }`. (`STREAM_CTX` already carries
`ageA`, `deadA/B`, `single`, `factor`; its `ageA` is Partner A's age, the lump timing.)

Hook, beside `window.__test_streamAmountsForYear`:

```js
  window.__test_lumpAmountsForYear = (lumps, ctx) => ({ ...lumpAmountsForYear(lumps, ctx, LUMP_OUT) });
```

- [ ] **Step 4: Run the pure-function cases**

Run: `node tests/lump_income.js`. Expected: the pure cases and the exactness case pass; the engine cases still fail.

- [ ] **Step 5: Implement the year-loop wiring**

At the `listAmountsForYear` call (~10437) destructure `lumps` and copy into locals right after it (spec 6.1; the guardrail
skip and `row.income` read them late in the year body):

```js
      const lumpFlow = lumps.flowTotal,
        lumpYear = lumpFlow > 0,
        lumpWagesA = lumps.wagesA, lumpWagesB = lumps.wagesB,
        lumpOtherA = lumps.otherA, lumpOtherB = lumps.otherB,
        lumpGainA = lumps.gainA, lumpGainB = lumps.gainB,
        lumpNoNiitA = lumps.gainNoNiitA, lumpNoNiitB = lumps.gainNoNiitB;
      // E1d: Social Security wages for the wage base, payroll tax and the profile (a wages lump has no premium, no
      // contribution and no coverage, so it never touches `streams`).
      const ssWagesA = lumpYear ? streams.wagesA + lumpWagesA : streams.wagesA,
        ssWagesB = lumpYear ? streams.wagesB + lumpWagesB : streams.wagesB;
```

Then:
- both `selfEmploymentTax` calls: replace `Math.max(0, streams.wagesA - streams.premiumA)` with
  `Math.max(0, ssWagesA - streams.premiumA)` (and B). A lump has no premium; `ssWagesA - premiumA` is the stream's own
  term plus the lump, and outside a lump year it is the old expression.
- `wages` (~10462): make it `let` and append `if (lumpYear) wages += lumpFlow;` after it. Check every reader of `wages` in
  the year body (the two `flow` expressions ~10861-10875 and `row.wages`) and list them in the task report.
- `buildTaxProfile` call: `streamWagesA: ssWagesA, streamWagesB: ssWagesB`,
  `streamOtherA: lumpYear ? streams.otherA + lumpOtherA : streams.otherA` (and B).
- `payrollTax` call (~10844): `streamWagesA: ssWagesA, streamWagesB: ssWagesB`.
- Guardrails, after the `baseSpend` expression that calls `guardrailSpendingMultiplier` (~10810-10813), on its own line:
  `if (lumpYear) guardrails.prevPortfolio = null; // E1d decision 11: the year after a lump year holds`.
- Deficit branch (~10917-10918): wrap both lines in `if (!lumpYear) { ... }`.
- Forced pass (~11109-11111): keep `guardrails.initialWR = guardrailSnapshot.initialWR;` unconditional; wrap the
  `firstWithdrawal` line and the `recordGuardrailWithdrawal` line in `if (!lumpYear)`.
- Trace entry (~11329): add `guardrails: { ...guardrails }, firstWithdrawal, forcedPass,`. If `forcedPass` is not in scope
  there, stop and report (do not restructure the loop).

Do not touch `bal.cash += oneTimeAmount` (~10886): `oneTimeAmount` is now `LUMP_OUT.taxFree`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node tests/lump_income.js` (PASS), `node tests/snapshot.js` (PASS against the committed baseline: no entry moved),
`npm test` (green), `npm run check:shared` (OK). Then the timing gate (Global Constraints) and record it.

- [ ] **Step 7: Commit**

```bash
git add tests/lump_income.js
git commit -m "E1d 2: lumpAmountsForYear; taxable lumps in the cash flow; wages and ordinary lumps on the owner's return (payroll and SE wage base); guardrails skip a lump year and the next year holds; no existing number change" -- Planner_US.html package.json tests/lump_income.js
```

---

### Task 3: Gain lumps in the tax code and MAGI (US; no existing number change)

**Files:**
- Modify: `Planner_US.html`: `buildTaxProfile` parameters and both profile literals (~8763-8920); `taxFor` (~6710-7000):
  the joint branch start (~6752), the one-person branch start (~6823), the two-filer `gainA`/`gainB` (~6889), the three
  `niitTax` calls (~6812, ~6876, ~6996-6997); `returnMagis` (~7308-7313); `magiBase0` (~10565); `totalIncome` (~10809 and
  ~10943); the `buildTaxProfile` call in the year loop.
- Modify: `tests/lump_income.js`.

**Interfaces:**
- Consumes: Task 2's year-loop locals `lumpYear`, `lumpGainA/B`, `lumpNoNiitA/B`.
- Produces: profile fields `lumpOn` (boolean), `lumpGainA`, `lumpGainB`, `lumpGainNoNiitA`, `lumpGainNoNiitB` (numbers) on
  every profile `buildTaxProfile` returns (false and zeros outside a lump year); `taxFor` and `returnMagis` read them only
  when `profile.lumpOn === true` (a profile without the key, built elsewhere, reads as no lump).

- [ ] **Step 1: Write the failing tests**

Add to `tests/lump_income.js` a `taxFor` block evaluated in the page (`window.__test_taxFor` if it exists; otherwise add the
hook `window.__test_taxFor = taxFor;` in this task beside the other hooks). Profiles are literals (the `profile(o)` helper of
`tests/self_employment.js`, with `seOn: false`, `lumpOn: false` and all lump fields 0 by default). The equivalences are
implementation-independent and pin every reader in each branch at once:

```js
  const tf = await page.evaluate(() => {
    const t = window.__test_tax, st = window.__test_getState(), saved = st.stateTax, out = { eq: [], two: [], niit: 0, ctc: 0 };
    const kids = [{ age: 13, student: false, qualifyingChild: true }, { age: 15, student: false, qualifyingChild: true }];
    const P = (o) => Object.assign({ year: 0, filing: 'single', singlePerson: true, otherA: 0, otherB: 0, extraA: 0, extraB: 0,
      wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 50, ageB: 50, invOrd: 0, invQual: 0,
      propertyTax: 0, mortgageInterest: 0, dependents: [], seOn: false, lumpOn: false, lumpGainA: 0, lumpGainB: 0,
      lumpGainNoNiitA: 0, lumpGainNoNiitB: 0 }, o);
    const SE = { seOn: true, seNetA: 120000, sePlanNetA: 120000, seEarnedA: 120000, seAllowA: false, seHealthA: 0, seHealthB: 0 };
    try {
      for (const code of ['tx', 'ca', 'al', 'wa', GAINS_RULE_STATE]) { // al: lagged federal-tax state; wa: gains-only tax
        st.stateTax = code;
        // joint and one-person branches: a lump gain is taxed exactly like the same gain passed as `gains`
        // (invQual 0, so the branch's gains are arg + 0 + lump: the same double); with and without self-employment (QBI)
        for (const [filing, single] of [['mfj', false], ['single', true], ['hoh', true]])
          for (const se of [{}, SE]) {
            const p = P({ filing, singlePerson: single, otherA: 180000 + (se.seNetA || 0), wageA: 180000, ssA: 20000,
              dependents: filing === 'single' ? [] : kids, ...se });
            out.eq.push([code, filing, !!se.seOn, t.taxFor({ ...p, lumpOn: true, lumpGainA: 300000 }, 0, 0), t.taxFor(p, 300000, 0)]);
          }
        // two-filer branch = A's one-person return (hoh, the children, A's gain) + B's (single, B's gain), less the
        // active-business part of B's NIIT. A: other 180,000 + lump 40,000 = MAGI 220,000, past hoh's 200,000 CTC line.
        // B: other 300,000 + lump 250,000 (50,000 active): NII 250,000, MAGI 550,000 - 200,000 = 350,000 >= 250,000, so the
        // exclusion removes exactly 3.8% x 50,000 = 1,900.
        for (const se of [{}, SE]) {
          const two = t.taxFor(P({ singlePerson: false, otherA: 180000 + (se.seNetA || 0), wageA: 180000, otherB: 300000, wageB: 300000,
            dependents: kids, ...se, lumpOn: true, lumpGainA: 40000, lumpGainB: 250000, lumpGainNoNiitB: 50000 }), 0, 0);
          const a = t.taxFor(P({ filing: 'hoh', otherA: 180000 + (se.seNetA || 0), wageA: 180000, dependents: kids, ...se }), 40000, 0),
            b = t.taxFor(P({ otherA: 300000, wageA: 300000 }), 250000, 0);
          out.two.push([code, !!se.seOn, two, a + b - 1900]);
        }
      }
      st.stateTax = 'tx';
      // NIIT alone: single, other 300,000, lump 100,000: NII 100,000, MAGI - 200,000 = 200,000: 3.8% x 100,000 = 3,800
      const q = P({ otherA: 300000, wageA: 300000, lumpOn: true, lumpGainA: 100000 });
      out.niit = t.taxFor(q, 0, 0) - t.taxFor({ ...q, lumpGainNoNiitA: 100000 }, 0, 0);
      // child credit: joint, other 380,000; a 40,000 lump gain makes MAGI 420,000, over the 400,000 joint line by 20 x 1,000:
      // the credit falls by 20 x 50 = 1,000 (credits read through childCredits with the branch's MAGI)
      out.ctc = t.childCredits(kids, 'mfj', 0, 380000, 1e9, 380000).nonrefundable - t.childCredits(kids, 'mfj', 0, 420000, 1e9, 380000).nonrefundable;
    } finally { st.stateTax = saved; }
    return out;
  });
  for (const [code, filing, se, viaLump, viaArg] of tf.eq) assert(Object.is(viaLump, viaArg), `lump gain = gains arg: ${code} ${filing} se=${se}: ${viaLump} vs ${viaArg}`);
  for (const [code, se, two, sum] of tf.two) near(two, sum, 1e-6, `two-filer = A's + B's one-person returns: ${code} se=${se}`);
  near(tf.niit, 3800, 1e-6, 'active business removes the NIIT on that gain');
  near(tf.ctc, 1000, 1e-6, 'CTC phase-out arithmetic (the joint equivalence above shows the branch passes the lump in the MAGI)');
```

The joint equivalence with `otherA` 180,000 is below the joint CTC line; add one more `eq` row with `otherA: 380000,
wageA: 380000` and the kids (mfj, tx) so the lump crosses 400,000 inside `taxFor`: `Object.is` again. Set `GAINS_RULE_STATE` to the code of the
first `STATE_RULES` row whose `base.gainsRate` is not null or whose `base.gainsDeduction` is above 0 (find it by reading the
table; name it in the task report), passed into the `page.evaluate`. Add the engine cases (helper `engine` from Task 2):

```js
  // MAGI in a working surplus year: the realized MAGI rises by exactly the gain share (no draws that year)
  const base = await engine({ ...W, incomeA: 200000 }, []),
    gl = await engine({ ...W, incomeA: 200000 }, [L({ age: 45, amount: 100000, kind: 'gain', gainPct: 60 })]);
  near(gl.rows[0].magiProxy - base.rows[0].magiProxy, 60000, 1e-6, 'gain share in MAGI');
  near(gl.rows[0].income - base.rows[0].income, 60000, 1e-6, 'row.income carries the gain');
  near(gl.rows[0].investable, base.rows[0].investable + 100000 - (gl.rows[0].tax - base.rows[0].tax), 0.01, 'cash conservation: gain 60%');
  // ACA: the aca_medicaid guard household (TX single 58, IRA 600,000, spending 14,000, premium 12,000, ACA on, enhanced off,
  // guardrails off); an ordinary lump of 80,000 at 60 (index 2) puts MAGI over 400% of the poverty line: that year's
  // healthcare equals the same year's healthcare with ACA modeling off (the full premium)
  const A0 = { singlePerson: true, ageA: 58, retireAgeA: 58, lifeExpectancyA: 90, returnRate: 5, bondReturn: 0, inflation: 2.5,
    hysaRate: 0, dividendYield: 0, medicalInflation: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0, tenure: 'rent', rent: 0,
    rentGrowth: 0, incomeA: 0, taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, tradIraA: 600000, trad401kA: 0, rothIraA: 0,
    roth401kA: 0, tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, acaEnabled: true, acaEnhanced: false, healthcare: 12000,
    medicaidWhenEligible: true, children: [], rothConvEnabled: false, incomeSources: [], stateTax: 'tx', spending: 14000,
    guardrailsEnabled: false, survivorEnabled: false };
  const acaLump = [L({ age: 60, amount: 80000, kind: 'ordinary', flat: true })];
  const on = await engine(A0, acaLump), off = await engine({ ...A0, acaEnabled: false }, acaLump), noL = await engine(A0, []);
  near(on.rows[2].healthcare, off.rows[2].healthcare, 0.01, 'over 400% FPL: the full premium');
  assert(on.rows[2].healthcare > noL.rows[2].healthcare + 5000, 'the lump costs the credit');
  // IRMAA: the same household at 66 on Medicare (medicareYearly 2,400, acaEnabled false), ordinary lump 250,000 at 68
  // (index 2; years 0 and 1 read the first-year stand-in, so keep the lump out of them): healthcare at 70 (index 4) is
  // higher than without the lump; at 69 (index 3) it is identical
  const M0 = { ...A0, ageA: 66, retireAgeA: 66, acaEnabled: false, medicareYearly: 2400 };
  const mL = await engine(M0, [L({ age: 68, amount: 250000, kind: 'ordinary', flat: true })]), m0 = await engine(M0, []);
  assert.strictEqual(mL.rows[3].healthcare, m0.rows[3].healthcare, 'IRMAA: nothing the next year');
  assert(mL.rows[4].healthcare > m0.rows[4].healthcare, 'IRMAA two years on');
  // two-return engine year (both working, a surplus year): owner-B gain 200,000 at A's 45 (index 0)
  const T2 = { ...C2, children: [] };
  const tL = await engine(T2, [L({ age: 45, amount: 200000, kind: 'gain', owner: 'B' })]), t0 = await engine(T2, []);
  near(tL.rows[0].magiB - t0.rows[0].magiB, 200000, 1e-6, "B's return carries B's gain");
  near(tL.rows[0].magiA - t0.rows[0].magiA, 0, 1e-6, "A's return does not");
  // a dead owner's gain: survivor scenario (A dies at 47, index 2); A's gain at 48 (index 3) is tax-free
  const S0 = { ...T2, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 47 };
  const sG = await engine(S0, [L({ age: 48, amount: 300000, kind: 'gain', gainPct: 70 })]),
    sF = await engine(S0, [L({ age: 48, amount: 300000, kind: 'free' })]);
  assert.strictEqual(sG.rows[3].tax, sF.rows[3].tax, "dead owner's gain is tax-free");
```

The `engine` helper must return `rows` with `magiA` / `magiB` (present in two-return years only) and `healthcare`. If an
expected equality does not hold, stop and report it with the numbers; do not loosen the test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/lump_income.js`. Expected: FAIL at the first equivalence (`viaLump` equals the no-gain tax). Record it.

- [ ] **Step 3: Implement the profile fields**

`buildTaxProfile`: add parameters `lumpOn = false, lumpGainA = 0, lumpGainB = 0, lumpNoNiitA = 0, lumpNoNiitB = 0` (after
`seAllowB`). In the survivor literal (A deceased) add, after `seHealthB: 0,`:

```js
            // E1d: a dead owner's gain never reaches the profile (it is tax-free); B's moves to the survivor's slot.
            lumpOn,
            lumpGainA: lumpGainB,
            lumpGainB: 0,
            lumpGainNoNiitA: lumpNoNiitB,
            lumpGainNoNiitB: 0,
```

In the normal literal, after `seHealthB: 0,`: `lumpOn, lumpGainA, lumpGainB, lumpGainNoNiitA: lumpNoNiitA,
lumpGainNoNiitB: lumpNoNiitB,`. In the year loop's `buildTaxProfile` call pass `lumpOn: lumpYear, lumpGainA, lumpGainB,
lumpNoNiitA, lumpNoNiitB`.

- [ ] **Step 4: Implement `taxFor`, `returnMagis`, `magiBase0`, `totalIncome`**

`taxFor`, next to `const seOn = ...` in the top declarations: `lumpOn = profile.lumpOn === true,`. Then:
- Joint branch, first statement inside `if (filingRow(profile.filing).joint) {`:
  `if (lumpOn) gains += profile.lumpGainA + profile.lumpGainB;`
  and its NIIT: `niitTax(ordinary + gains, lumpOn ? gains + invOrd - (profile.lumpGainNoNiitA + profile.lumpGainNoNiitB) : gains + invOrd, 'mfj')`.
- One-person branch, first statement inside `if (profile.singlePerson) {`: the same reassignment; its NIIT the same with
  `status`.
- Two-filer branch: `const gainA = gains / 2, gainB = gains / 2,` becomes two `let`s with the rest of that declaration left
  as `const`, followed by `if (lumpOn) { gainA += profile.lumpGainA; gainB += profile.lumpGainB; }`; the NIIT calls become
  `niitTax(ordinaryA + gainA, lumpOn ? gainA + invA - profile.lumpGainNoNiitA : gainA + invA, statusA)` and the B
  counterpart with `lumpGainNoNiitB`.
- Readers this reaches (list each with its line in the task report; spec 6.3): joint ~6754-6813 (provisional income
  `other`, `sources.gains`, `federalLiabilityForState`, `federalDeduction`, QBI's taxable income and `netGain` ~6804,
  `longTermGainTax`, `childCredits`' MAGI ~6809, `niitTax` ~6812); one-person ~6823-6877 (the same, QBI ~6868, credits
  ~6873, NIIT ~6876); two-filer ~6889-7000 (`taxableSocialSecurity` A/B, `sourcesA/B.gains`, `federalLiabilityForState`
  A/B, `federalDeduction` A0/B0, QBI ~6976 / ~6980, the children block's `longTermGainTax` ~6988 and `childCredits` ~6989,
  the return's `longTermGainTax` A/B, `niitTax` A/B).

`returnMagis`: keep the existing array literal, then append the gains:

```js
    const m = [/* the existing two expressions, unchanged */];
    // E1d: each owner's lump gain on their own return (appended: the sum order of the old terms is unchanged).
    if (profile.lumpOn === true) { m[0] += profile.lumpGainA; m[1] += profile.lumpGainB; }
    return m;
```

`magiBase0` (~10565): `const magiBase0 = lumpYear ? otherA + otherB + ss + inv.ordinary + inv.qualified + (lumpGainA + lumpGainB) : otherA + otherB + ss + inv.ordinary + inv.qualified;`
(wages and ordinary lumps are already in `otherA/B`). Before that line, assert by reading that `otherA/B` returned by
`buildTaxProfile` include the stream other income (they do: `otherA = profileWageA + ... + streamOtherA + seNetA`).

`totalIncome`: after `let totalIncome = ... + conversionAmount;` (~10809) add `if (lumpYear) totalIncome += lumpGainA + lumpGainB;`;
after the reassignment `totalIncome = otherA + otherB + ... + wd.taxableGainGross;` (~10943) add the same line.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node tests/lump_income.js` (PASS), `node tests/snapshot.js` (PASS: no entry moved), `node tests/tax_caches.js`,
`node tests/two_return_magi.js`, `node tests/qbi.js` (PASS), `npm test` (green), `npm run check:shared` (OK); the timing gate.

- [ ] **Step 6: Commit**

```bash
git commit -m "E1d 3: gain lumps in taxFor (every branch reader), NIIT active-business exclusion, returnMagis, magiBase0, row.income; no existing number change" -- Planner_US.html tests/lump_income.js
```

---

### Task 4: Snapshot scenarios, docs, version badge, timing record

**Files:**
- Modify: `tests/snapshot_scenarios.js` (US list), `tests/snapshots/us.json` (regenerated: added entries only),
  `Planner_US.html` (the `<span>V125</span>` badge in the topbar `<h1>` -> `V126`), `README.md` (feature list), `CLAUDE.md`
  (a paragraph), `docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md` (section 7's line on
  `field_registry.js` / `snapshot_ui.js`: they skip DYN rows, the UI is covered by `test_lump_income.js`),
  `docs/next-batches-plan.md` (E1d implementation notes after the E1d design record).

- [ ] **Step 1: Add the scenarios** (after `'R W-2 stream premium'` in the US list):

```js
    ['R lump severance retirement year', { ...R, guardrailsEnabled: true, oneTimeIncome: [{ amount: 150000, age: 52, flat: true, kind: 'wages', owner: 'A', gainPct: 100, activeBusiness: false }] }],
    ['R lump deferred comp B', { ...R, oneTimeIncome: [{ amount: 120000, age: 55, flat: false, kind: 'ordinary', owner: 'B', gainPct: 100, activeBusiness: false }] }],
    ['R lump gain', { ...R, oneTimeIncome: [{ amount: 400000, age: 56, flat: false, kind: 'gain', owner: 'A', gainPct: 60, activeBusiness: false }] }],
    ['R lump business sale', { ...R, oneTimeIncome: [{ amount: 2000000, age: 57, flat: true, kind: 'gain', owner: 'A', gainPct: 80, activeBusiness: true }] }],
    ['R lump gain B two returns', { ...R, filingStatus: 'single', oneTimeIncome: [{ amount: 300000, age: 54, flat: false, kind: 'gain', owner: 'B', gainPct: 50, activeBusiness: false }] }],
    ['R lump dead owner', { ...R, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 58, oneTimeIncome: [{ amount: 80000, age: 58, flat: false, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false }, { amount: 300000, age: 60, flat: false, kind: 'gain', owner: 'A', gainPct: 70, activeBusiness: false }] }],
    ['R lump guardrails later', { ...R, guardrailsEnabled: true, oneTimeIncome: [{ amount: 60000, age: 60, flat: false, kind: 'wages', owner: 'A', gainPct: 100, activeBusiness: false }] }],
    ['R lump ACA line', { ...R, acaEnabled: true, oneTimeIncome: [{ amount: 40000, age: 53, flat: false, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false }] }],
```

- [ ] **Step 2: Regenerate and check**

Run: `npm run snapshot:update`, then `git diff --stat tests/snapshots/us.json` and confirm the diff is added entries only
(no deleted or changed line: `git diff tests/snapshots/us.json | grep '^-' | grep -v '^---'` prints nothing). Then
`npm test` (green).

- [ ] **Step 3: Docs and badge**

- Badge `V125` -> `V126` (US only; Canada unchanged).
- `README.md`: in the feature list's one-time income line, say each lump has a tax treatment (tax-free, wages with payroll
  tax, ordinary income, long-term gain with a gain share and an active-business NIIT exclusion) and an owner.
- `CLAUDE.md`: in "Add-as-you-go lists", after the "Streams in E1c (US)" paragraph, a paragraph "**One-time income (US,
  E1d).**" covering: the row keys (`kind`, `owner`, `gainPct`, `activeBusiness`) and `normalizeUsLumps`; the pure
  `lumpAmountsForYear` (scratch `LUMP_OUT`, raw rows read defensively, the dead-owner rule from the death year on, the gain
  basis to `taxFree`, `flowTotal` the one gate); `oneTimeAmount` = `taxFree` (today's cash path); taxable lumps in `wages`;
  wages and ordinary through `streamWagesA/B` (also the SE wage base) / `streamOtherA/B`; the profile fields `lumpOn`,
  `lumpGainA/B`, `lumpGainNoNiitA/B` (both literals always carry them; read only under `lumpOn`), the per-branch gain in
  `taxFor`, `returnMagis`, `magiBase0`, `row.income`; the guardrail rule (no record in a lump year, the next year holds);
  the trace fields `guardrails`, `firstWithdrawal`, `forcedPass`; tests `tests/lump_income.js`, `test_lump_income.js`.
- Spec section 7: replace "**`tests/field_registry.js`, `tests/snapshot_ui.js`:** the new row fields, show/hide by kind and
  single-person mode, a reload round trip." with a line saying both skip `[data-dyn-list]` rows by design, so the row fields,
  show/hide and the round trip are covered by `test_lump_income.js`.
- `docs/next-batches-plan.md`: "##### E1d: implementation (US V125 -> V126)" after the E1d design record: commits, red
  then green per task, the `wages` readers list (Task 2), the reader lines (Task 3), the legacy diff, the snapshot diff
  (added entries), the three timing tables, deviations, and anything for the owner.

- [ ] **Step 4: Final checks and commit**

Run: `npm test`, `npm run check:shared`, `node test_lump_income.js`, `node test_income_streams.js`,
`node test_self_employment.js`, the timing gate (median of three), and the mobile check (inside `test_lump_income.js`).

```bash
git commit -m "E1d 4: snapshot scenarios (added only), README, CLAUDE.md, spec note, batch notes; US V126" -- tests/snapshot_scenarios.js tests/snapshots/us.json Planner_US.html README.md CLAUDE.md docs/superpowers/specs/2026-10-09-e1d-one-time-income-design.md docs/next-batches-plan.md
```

Report to the owner: the commit list, every red-then-green, the timing tables, the reader lists, and any deviation from this
plan with its reason.
