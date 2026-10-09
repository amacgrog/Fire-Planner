# E1c: self-employment (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make self-employment a kind of income (a partner's main income, or an income stream) with its SE tax, a Solo
401(k), marketplace or spouse-plan coverage with the self-employed health insurance deduction inside the MAGI iteration,
and the QBI deduction; give W-2 streams an optional health premium that makes the job the owner's coverage.

**Architecture:** Pure functions (`selfEmploymentTax`, `soloPlanContributions`, `seHealthDeduction`, `qbiDeduction`,
`streamCoverBits`) fed by a per-person self-employment total (`seA = seMainA + streams.selfA`). The year loop computes SE
tax and the Solo 401(k) once a year; the 162(l) deduction is a third estimate in the MAGI iteration (next to `estTrad` /
`estGain`), carried by `magiBase` (made a per-pass `let`) and by `returnMagis`; QBI is subtracted in each `taxFor` branch
next to the standard or itemized deduction. Employer coverage (`employerA/B`) replaces `workingA/B` wherever "working"
meant "on an employer health plan" (ACA eligibility, Medicare, IRMAA gating).

**Tech Stack:** `Planner_US.html` (one inline `<script>` IIFE, no build), Node + Playwright tests (`tests/*.js`,
`test_*.js`).

**Spec:** `docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md` (read it first; this plan argues from it).
Background: `CLAUDE.md` ("Retirement accounts (US)", "Contribution limits and profit sharing (US, E1a)", "MAGI iteration
(both engines)", "Per-year solver and the cliff plan", "Add-as-you-go lists", "Testing checklist"); the E1b plan
`docs/superpowers/plans/2026-10-08-e1b-income-streams.md` and its tests (`tests/income_streams.js`,
`tests/stream_contributions.js`) for boilerplate and the stream code this plan extends.

## Global Constraints

- Worktrees: `git -C C:\Users\Alex\code\Fire-Planner worktree add ../fp-e1c -b claude/e1c-self-employment PLAN_COMMIT`
  (PLAN_COMMIT = the commit that adds this plan), baseline
  `git -C C:\Users\Alex\code\Fire-Planner worktree add --detach ../fp-e1c-base ee7a789`. `npm install` in each if
  `node_modules` is missing (or link `node_modules` from another worktree as a junction).
- Never edit, stash, check out, reset or commit in `C:\Users\Alex\code\Fire-Planner` (the owner's checkout and stashes).
  Never push, open a PR or merge.
- **US only.** No change to `Planner_Canada.html`, `shared/`, or any `@@shared` region (check each edit site is outside
  every `@@shared:... begin/end` pair; `npm run check:shared` must print OK at every commit). Never run `npm run sync`.
- `npm test` green at every commit.
- **Exactness:** no existing entry of `tests/snapshots/us.json` or `canada.json` may change in any commit. Tasks 1-5 add no
  snapshot scenario: `node tests/snapshot.js` must pass against the committed baseline after each of them (the exactness
  gate; on a difference, stop and find the changed sum order, never update). Task 6 adds the seven new scenarios: the json
  diff shows added entries only. Every new term is an exact zero for an all-W-2 household with no `self` stream and no
  stream premium, and is appended AFTER today's terms in each sum (`x + 0`, `x - 0` leave a double unchanged; inserting a
  term in the middle of a sum does not, unless the text below says the grouping is equal).
- UI snapshot (`ui_us.json`) and legacy corpus (`legacy_state.json`) change only in Task 1, and the commit message says
  so.
- No heuristic, gate or threshold the spec does not name.
- **Timing** (Tasks 2, 5, 6): `node tests/bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21` (at most +5% per
  path) and `node tests/bench_solver.js --base ../fp-e1c-base --rounds 31` (recorded as measured). Report both tables
  verbatim. Task 6 also records (not gated) one side-business timing (Step 10 there).
- Each commit: only your paths, `git commit -m "..." -- <paths>` (`git add` new files first), message ending
  `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- Ledger and task reports in `.superpowers/sdd/2026-10-08-e1c/` inside the worktree (git-excluded).
- Shell: never put Markdown backticks inside a double-quoted shell string; write text to a file and insert it with a small
  node script. The tree is CRLF; never use `sed -i` on a planner (it strips CRLF); edit with the Edit tool or node.
- Tests are written FIRST and run red (each task's Step 2); record the red output in the task report.
- Line numbers below are at `ee7a789` and drift as you edit; find each site by the quoted code.

## Review Focus

1. **A self-employed partner past their retirement age, or dead:** `seMainX` is 0 (it follows `workingX`), so no SE tax,
   no Solo 401(k), no 162(l), and coverage follows the retired rules. Task 3, Step 1 (case `retired self-employed`).
2. **A main income switched to Self-employed with a match still stored (`matchA: 50`) and a per-paycheck premium
   (`healthPremiumA: 200`):** the engine ignores both (no employer money, no premium). Task 4, Step 1 (case `stale W-2
   fields`).
3. **A `self` stream that still carries a W-2 panel's `matchPct` and `healthPremium`:** no match, no premium, no coverage.
   Task 2, Step 1 (case `self stream premium ignored`) and Task 4, Step 1 (case `self stream match ignored`).
4. **The survivor is self-employed (A dies, B self-employed):** SE tax once, B's net in slot A of the remapped profile,
   the deduction capped by B's net. Task 5, Step 1 (case `survivor self-employed`).
5. **Unmarried couple, A self-employed and 65+ on Medicare, B's employer box ticked:** A's Medicare premium is deductible
   (a partner's employer does not bar it); the same household married: not deductible. Task 5, Step 1 (case
   `unmarried Medicare`).

---

### Task 1: Inputs: income type, stream kind `self`, stream profit sharing and premium (US; no number change)

**Files:**
- Modify: `Planner_US.html`: markup near `#incomeA` (~line 357) / `#incomeB`, the `#matchA` / `#matchB` /
  `#healthPremiumA` / `#healthPremiumB` wrappers, the income / profit-sharing / employer-covers tooltips; `defaults` (~line
  800); `FIELDS` (after the `k401Type` entry, ~line 1289); `normalizeUsStreams` (~line 1141); `DYN.incomeSources`
  (~line 14074); `syncControls()` (button list ~line 14491, reveal lines); the click listeners next to `k401TraditionalBtn`
  (~line 14934)
- Modify: `tests/legacy_state.js` (US cases), `test_income_streams.js` is NOT touched; Create: `test_self_employment.js`
- Update (allowed): `tests/snapshots/legacy_state.json`, `tests/snapshots/ui_us.json`

**Interfaces:**
- Produces: `state.incomeKindA/B` (`'wages' | 'self'`, default `'wages'`); stream keys `kind: 'other' | 'wages' | 'self'`,
  `profitSharingPct` (0-25), `healthPremium` (dollars >= 0, yearly, today's dollars); element ids `incomeKindAWagesBtn`,
  `incomeKindASelfBtn`, `incomeKindBWagesBtn`, `incomeKindBSelfBtn`, `matchAField`, `matchBField`, `healthPremiumAField`,
  `healthPremiumBField`; DYN ids `incSrc<i>ProfitSharingPct`, `incSrc<i>HealthPremium`.

- [ ] **Step 1: Write `test_self_employment.js`** (repo root, Playwright; boilerplate as `test_income_streams.js`: clock
  2026-06-15, `pageerror` collected). Part 1 (this task):
  - fresh load: `state.incomeKindA === 'wages'`; `#incomeKindAWagesBtn` has class `active`; `#matchAField` and
    `#healthPremiumAField` visible;
  - click `#incomeKindASelfBtn`: `state.incomeKindA === 'self'`, `#matchAField.hidden === true`,
    `#healthPremiumAField.hidden === true`; click `#incomeKindAWagesBtn`: both visible again;
  - click `#incomeKindBSelfBtn`: `#matchBField.hidden` and `#healthPremiumBField.hidden` true; tick `#singlePerson`
    (change event): the B type buttons' wrapper is hidden; untick;
  - add a stream (`[data-dyn-add="incomeSources"]`): the kind select has the three options `other`, `wages`, `self`;
    `#incSrc0HealthPremium` hidden for `other`, shown after `selectOption('#incSrc0Kind', 'wages')`, hidden again for
    `self`; for `self` with `#incSrc0Contribute` checked: `#incSrc0ProfitSharingPct` shown and `#incSrc0MatchPct` hidden;
    for `wages` with contribute: the match shown and profit sharing hidden;
  - `state.incomeSources[0]` after the add has `profitSharingPct: 0, healthPremium: 0`;
  - reload keeps `incomeKindA: 'self'` (autosave round trip);
  - load `window.__test_replaceState` with `{ incomeKindA: 'x', incomeSources: [{ amount: 1, startAge: 50, endAge: 60, kind: 'self', profitSharingPct: 40, healthPremium: -5 }] }`
    (check the hook's name and argument shape with a grep first): `incomeKindA === 'wages'`, `kind === 'self'`,
    `profitSharingPct === 25`, `healthPremium === 0`;
  - 390 x 844 with the type buttons and a `self` stream panel open: `scrollWidth > clientWidth` is `false`;
  - no page errors; print `test_self_employment: part 1 passed`; leave `// Part 2 (Task 6)` marker.
- [ ] **Step 2: Run it; it fails** (`#incomeKindASelfBtn` does not exist).
- [ ] **Step 3: Defaults and registry.** `defaults`: `incomeKindA: 'wages', incomeKindB: 'wages',` next to `k401Type`.
  `FIELDS`, right after the `k401Type` entry:
```js
    // E1c: a partner's main income is W-2 pay or self-employment (business profit). Self-employed hides the match and the
    // per-paycheck premium (the engine ignores them: wageX is 0 for a self-employed partner).
    { key: 'incomeKindA', type: 'choice', manual: true, values: ['wages', 'self'], fallback: 'wages', mcp: true, reveals: [{ id: 'matchAField', hidden: (s) => s.incomeKindA === 'self' }, { id: 'healthPremiumAField', hidden: (s) => s.incomeKindA === 'self' }] },
    { key: 'incomeKindB', type: 'choice', manual: true, values: ['wages', 'self'], fallback: 'wages', mcp: true, reveals: [{ id: 'matchBField', hidden: (s) => s.singlePerson || s.incomeKindB === 'self' }, { id: 'healthPremiumBField', hidden: (s) => s.singlePerson || s.incomeKindB === 'self' }] },
```
  Confirm with a grep that a `manual: true` choice with `fallback` is normalized by the registry's enum guard (as
  `survivorPartner` / `filingStatus` are); if manual entries skip the guard, add the two keys to the guard by the same
  mechanism `filingStatus` uses, and say so in the report.
- [ ] **Step 4: Markup.** Add `id="matchAField"` to the `<div class="field">` that wraps `#matchA`, `id="matchBField"` to
  the `<div class="field" data-partner-b>` that wraps `#matchB`, `id="healthPremiumAField"` / `id="healthPremiumBField"`
  to the wrappers of `#healthPremiumA` / `#healthPremiumB`. Right after the `#incomeA` field's closing `</div>`:
```html
          <div class="field" style="display:block"><label style="display:block;margin-bottom:8px">Partner A income <span class="info-nw">type<button type="button" class="info-tip" aria-label="More info" aria-expanded="false" data-tip="Self-employed: business profit, after expenses. It pays self-employment tax (half of it is deducted), gets the qualified business income deduction (treated as a specified service business with no employees), can fund a Solo 401(k) (contribution, profit sharing at the plan rate, after-tax money) and an IRA, and puts you on the ACA marketplace (or your partner&#x27;s employer plan, see the employer-plan boxes) with the self-employed health insurance deduction; Medicare starts at 65.">i</button></span></label><div class="choice" role="radiogroup" aria-label="Partner A income type"><button type="button" id="incomeKindAWagesBtn" role="radio">W-2</button><button type="button" id="incomeKindASelfBtn" role="radio">Self-employed</button></div></div>
```
  and the same after `#incomeB`'s field with `data-partner-b` on the outer div, "Partner B", ids `incomeKindBWagesBtn` /
  `incomeKindBSelfBtn`. Tooltips (edit the existing `data-tip` text; HTML-escape apostrophes as `&#x27;`):
  - `#incomeA` / `#incomeB`: append " If you are self-employed, enter business profit (after expenses, before
    self-employment tax) and choose Self-employed below."
  - profit sharing A / B: append " Self-employed: your plan's rate (0-25%). The contribution is profit less half the
    self-employment tax, times rate / (1 + rate): 25% gives 20%."
  - `employerCoversSpouseA` (and the mirror text for B): "Applies while Partner A has employer coverage (a W-2 main job, or
    a W-2 income stream with a health premium) and Partner B has none. Checked (default): B is on A's plan (a
    self-employed B then gets no self-employed health insurance deduction). Unchecked: B buys marketplace coverage, with
    the premium tax credit and, if self-employed, the deduction. If A's employer offers affordable family coverage to a
    spouse, keep it checked: the marketplace would cost the full premium with no credit and no deduction."
- [ ] **Step 5: Sync and clicks.** In `syncControls()`'s button list (next to `['k401TraditionalBtn', 'traditional',
  'k401Type']`) add `['incomeKindAWagesBtn', 'wages', 'incomeKindA'], ['incomeKindASelfBtn', 'self', 'incomeKindA'],
  ['incomeKindBWagesBtn', 'wages', 'incomeKindB'], ['incomeKindBSelfBtn', 'self', 'incomeKindB'],`. After the partner-B
  `[data-partner-b]` loop add `for (const id of ['matchAField', 'healthPremiumAField']) document.getElementById(id).hidden = revealHidden(id);`
  (the B fields are `data-partner-b`, so the loop already applies their reveals). Next to the `k401TraditionalBtn`
  listener add four listeners: `document.getElementById('incomeKindAWagesBtn').addEventListener('click', () => setContributionType('incomeKindA', 'wages'));`
  and likewise for the other three.
- [ ] **Step 6: Streams.** `DYN.incomeSources`: `fresh()` gains `profitSharingPct: 0, healthPremium: 0`. `fields`:
  - `kind`: `options: [['other', 'Not earned'], ['wages', 'W-2 wages'], ['self', 'Self-employment']]`; append to its tip:
    " Self-employment: business profit; it pays self-employment tax, can fund the owner's Solo 401(k) (shared with a
    self-employed main income) and IRA, and stops in the owner's death year."
  - right after `kind`: `{ key: 'healthPremium', kind: 'money', label: 'Health premium', short: "Yearly; this job's plan", step: 100, showIf: (it) => it.kind === 'wages', tip: "What you pay for this job's health plan each year, before tax. Above zero means this job covers its owner (and the other partner, if the owner's employer-plan box is checked): no marketplace while it runs." }`;
  - `contribute`: `showIf: (it) => it.kind === 'wages' || it.kind === 'self'`;
  - `deferralType`, `deferralPct`, `afterTaxPct`, `personalPct`: `showIf: (it) => (it.kind === 'wages' || it.kind === 'self') && it.contribute`;
  - `matchPct`: unchanged (`it.kind === 'wages' && it.contribute`);
  - after `matchPct`: `{ key: 'profitSharingPct', kind: 'num', label: 'Profit sharing', short: 'Plan rate, %', min: 0, max: 25, step: 0.5, showIf: (it) => it.kind === 'self' && it.contribute, tip: "Your Solo 401(k) plan's rate (0-25%). The contribution is this business's profit less half the self-employment tax, times rate / (1 + rate): 25% gives 20%. Shares one yearly limit with every other self-employment of this person." }`.
  `normalizeUsStreams` (inside the returned object):
```js
        kind: r.kind === 'wages' || r.kind === 'self' ? r.kind : 'other',
        ...
        profitSharingPct: Math.min(25, pct0(r.profitSharingPct)),
        healthPremium: r.healthPremium !== '' && r.healthPremium !== null && Number.isFinite(Number(r.healthPremium)) ? Math.max(0, Number(r.healthPremium)) : 0,
```
- [ ] **Step 7: Legacy cases** (`tests/legacy_state.js`, US block after the E1b ones):
  `'income kind self': { incomeKindA: 'self', incomeKindB: 'wages' }`, `'income kind junk': { incomeKindA: 'freelance', incomeKindB: 7 }`,
  `'stream self': { incomeSources: [{ amount: 30000, startAge: 50, endAge: 60, kind: 'self', contribute: true, profitSharingPct: 20, deferralPct: 100 }] }`,
  `'stream self junk': { incomeSources: [{ amount: 30000, startAge: 50, endAge: 60, kind: 'self', profitSharingPct: 99, healthPremium: -1 }, { amount: 5000, startAge: 50, endAge: 60, kind: 'wages', healthPremium: '4000' }] }`.
- [ ] **Step 8: Run.** `node test_self_employment.js` part 1 passes. `npm test`: expected failures only in
  `tests/legacy_state.js` (every US case: two new top-level keys; stream cases: two new stream keys) and
  `tests/snapshot_ui.js` (US: new controls and the MCP schema's two new properties). Legacy proof: a scratch script (not
  committed) loads every US corpus case on `../fp-e1c-base` and the working tree and shows the normalized states are equal
  after deleting `incomeKindA`, `incomeKindB` and, from every stream, `profitSharingPct` and `healthPremium` (and for the
  `kind: 'self'` cases, `kind`); Canada unchanged. Then `node tests/legacy_state.js --update` and
  `node tests/snapshot_ui.js --update`; restore `ui_canada.json` if rewritten with no content change; confirm the
  `ui_us.json` diff is the new controls, the MCP schema and the DOM/rendered hashes only. `node tests/snapshot.js` passes
  unchanged (the engine reads nothing new). `node tests/field_registry.js` passes. `npm test` green.
- [ ] **Step 9: Commit.**
```bash
git add test_self_employment.js
git commit -m "E1c 1: income type (W-2 / self-employed), stream kind self, stream profit sharing and health premium inputs (US; legacy and UI snapshots updated for the new keys and controls; no number change)" -- Planner_US.html tests/legacy_state.js test_self_employment.js tests/snapshots/legacy_state.json tests/snapshots/ui_us.json
```

---

### Task 2: Employer coverage and the W-2 stream premium (US; existing snapshots byte-identical)

**Files:**
- Modify: `Planner_US.html`: `STREAM_OUT` / `streamAmountsForYear` / `listAmountsForYear` (~line 9791-9830), a new
  `streamCoverBits` below them, the year loop (wages, `employerA/B`, `acaEligibility`, `conversionMagiCeiling`, `hcArgs`,
  `magiThresholds`, `medA/medB`), `buildTaxProfile` (`streamPremiumA/B`), `payrollTax`, `healthcareCost` comments, test
  hooks after `// @@shared:block end`
- Create: `tests/se_health.js` (coverage part; Task 5 extends it)
- Modify: `package.json` (`test`: add `node tests/se_health.js` right after `node tests/stream_contributions.js`)

**Interfaces:**
- Consumes: Task 1's keys.
- Produces:
  - `STREAM_OUT` gains `selfA, selfB, premiumA, premiumB` (numbers) and `coverA, coverB` (booleans); `ctx` gains
    `premiumFactor`.
  - `function streamCoverBits(streams, ctx)` -> integer (bit 1: A covered by a W-2 stream with a premium, bit 2: B), same
    ctx fields as `streamAmountsForYear` (only `ageA, ageB, deadA, deadB, single` read).
  - `payrollTax({ ..., streamPremiumA = 0, streamPremiumB = 0 })`; `buildTaxProfile({ ..., streamPremiumA = 0, streamPremiumB = 0 })`.
  - year-loop consts `employerA`, `employerB` (has employer health coverage this year).
  - hooks: `window.__test_streamAmountsForYear` also returns `selfA, selfB, premiumA, premiumB, coverA, coverB`;
    `window.__test_streamCoverBits = streamCoverBits`.

- [ ] **Step 1: Write `tests/se_health.js`** (boilerplate as `tests/income_streams.js`; clock 2026-06-15). Engine helper
  as in `tests/income_streams.js` (`window.__test_getState()`, assign, `window.__test_simulate()` rows and
  `window.__test_accountTrace()` trace with `profile` / `ficaTax`). Base `{ singlePerson: false, ageA: 55, ageB: 55,
  retireAgeA: 55, retireAgeB: 55, incomeA: 0, incomeB: 0, inflation: 0, incomeGrowth: 0, medicalInflation: 0,
  healthPremiumA: 0, healthPremiumB: 0, stateTax: 'tx', acaEnabled: false, healthcare: 18000, medicareYearly: 10000 }`
  (verify `medicalInflation` is the key `medicalGrowth` reads; if it is named differently use that key). Cases:
  - pure: `__test_streamAmountsForYear([{ amount: 30000, startAge: 50, endAge: 60, followGrowth: false, growth: 0, owner: 'B', kind: 'wages', healthPremium: 6000 }], { ageA: 55, ageB: 55, deadA: false, deadB: false, single: false, year: 0, factor: 1, incomeFactor: 1, premiumFactor: 1.5 })`
    -> `wagesB 30000, premiumB 9000, coverB true, coverA false`;
  - `self stream premium ignored`: the same stream with `kind: 'self'` -> `selfB 30000, premiumB 0, coverB false, wagesB 0`;
  - `__test_streamCoverBits` with that W-2 stream: `ageB 61` -> 0 (out of window), `deadB: true` -> 0, `single: true` (owner
    read as A, `ageA 55`) -> 1;
  - engine `stream premium covers`: base with `incomeSources: [W-2 owner A 30,000 age 50-60, healthPremium 6,000]`: year 0
    `rows[0].healthcare === 9000` (B alone on the marketplace: half of 18,000; A covered by the stream job, and B's box for
    A is irrelevant because A's box `employerCoversSpouseA` is the one that would cover B: set `employerCoversSpouseA: false`
    for this case); with `employerCoversSpouseA: true` -> `rows[0].healthcare === 0` (B rides on A's stream job);
  - same household: `trace[0].ficaTax === (30000 - 6000) * 0.0765` and `trace[0].profile.wageA === 24000` (premium pre-tax);
    `rows[0].wages === 30000 - 6000` (cash);
  - `Medicare while covered`: `ageA: 63, retireAgeA: 63`, a W-2 stream owner A age 60-70 with a premium, `medicareYearly`
    10,000: `rows[2].healthcare` (A 65, still covered) excludes A's Medicare, `rows[8]` (A 71, stream ended at 70)
    includes it (assert by comparing with the same household without the stream from year 8 on; the stream pay is far below every IRMAA tier, so the lookback adds nothing);
  - `legacy identical`: `R`-like household `{ ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000 }`
    with and without the explicit new keys (`incomeKindA: 'wages'`, a stream with `healthPremium: 0`): `JSON.stringify(rows)` equal.
  End with the error check and `console.log('se_health: coverage passed')`.
- [ ] **Step 2: Run it; it fails** (`premiumB` undefined).
- [ ] **Step 3: `streamAmountsForYear`.** `STREAM_OUT` gains `selfA: 0, selfB: 0, premiumA: 0, premiumB: 0, coverA: false,
  coverB: false`; reset them with the others at the top. Replace the `if (s.kind === 'wages') { ... }` block by:
```js
      if (s.kind === 'wages' || s.kind === 'self') {
        if (dead) continue;
        if (s.kind === 'wages') {
          if (b) out.wagesB += amount; else out.wagesA += amount;
          // E1c: a W-2 stream with a health premium is its owner's employer coverage; the premium is pre-tax pay.
          if (s.healthPremium > 0) {
            const premium = s.healthPremium * ctx.premiumFactor;
            if (b) { out.premiumB += premium; out.coverB = true; } else { out.premiumA += premium; out.coverA = true; }
          }
        } else if (b) out.selfB += amount;
        else out.selfA += amount;
        if (s.contribute === true) {
          const it = out.contrib.items[out.contrib.n++];
          it.owner = b ? 1 : 0; it.pay = amount; it.stream = s;
        }
      } else if (b !== dead) out.otherB += amount; // owner B alive, or owner A dead: the money is B's
      else out.otherA += amount;
      out.total += amount;
```
  (The W-2 path performs the same operations in the same order as before; `streamPlanContributions` already skips items
  whose stream is not `kind 'wages'`.) `STREAM_CTX` gains `premiumFactor: 1`; `listAmountsForYear` sets
  `STREAM_CTX.premiumFactor = factor * medicalGrowth(year);`. Below `listAmountsForYear`:
```js
  // E1c: which partners a W-2 stream with a health premium covers at the ages in ctx (bit 1: A, bit 2: B); the IRMAA
  // lookback asks it about the year two ahead. Same owner and window rules as streamAmountsForYear.
  function streamCoverBits(streams, ctx) {
    let bits = 0;
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (s.kind !== 'wages' || !(s.healthPremium > 0)) continue;
      const b = !ctx.single && s.owner === 'B',
        age = b ? ctx.ageB : ctx.ageA;
      if (!(age >= s.startAge && age <= s.endAge) || (b ? ctx.deadB : ctx.deadA)) continue;
      bits |= b ? 2 : 1;
    }
    return bits;
  }
  const COVER_CTX = { ageA: 0, ageB: null, deadA: false, deadB: false, single: false };
```
- [ ] **Step 4: Year loop.** After `listAmountsForYear(...)`:
```js
      // E1c: employer health coverage this year: a W-2 main job while working, or a W-2 stream with a premium. It replaces
      // "working" in every health-insurance rule (marketplace eligibility, Medicare, IRMAA); `workingX` keeps its meaning
      // for pay, contributions and account statuses.
      const employerA = (workingA && state.incomeKindA !== 'self') || streams.coverA,
        employerB = (workingB && state.incomeKindB !== 'self') || streams.coverB;
```
  `wages` becomes `wageA + wageB + extraIncome - healthPremiumA - healthPremiumB - streams.premiumA - streams.premiumB`
  (appended terms). Pass `workingA: employerA, workingB: employerB` (instead of `workingA, workingB`) to
  `acaEligibility(...)`, `conversionMagiCeiling(...)`, the `hcArgs` object and the `magiThresholds({...})` call (each reads
  `workingX` only to decide "on an employer plan": confirm by reading each function's uses of `workingA/B` before the
  change and list them in the report; if any other use exists, stop and report). Pass `streamPremiumA: streams.premiumA,
  streamPremiumB: streams.premiumB` to `buildTaxProfile` and to the `payrollTax` call. Before `for (let iter = 0; ; iter++)`:
```js
      COVER_CTX.ageA = age + 2; COVER_CTX.ageB = singlePerson ? null : ageB + 2; COVER_CTX.single = singlePerson;
      COVER_CTX.deadA = deceasedIsA && year + 2 >= deathYear; COVER_CTX.deadB = deceasedIsB && year + 2 >= deathYear;
      const cover2 = streamCoverBits(state.incomeSources, COVER_CTX);
```
  and change `medA` / `medB` to:
```js
          medA = !(survivor2 && deceasedIsA) && age + 2 >= 65 && !((state.incomeKindA !== 'self' && age + 2 < retireAgeA) || (cover2 & 1) !== 0),
          medB = !singlePerson && !(survivor2 && deceasedIsB) && ageB + 2 >= 65 && !((state.incomeKindB !== 'self' && ageB + 2 < retireAgeB) || (cover2 & 2) !== 0);
```
  (For a W-2 main job and no stream premium, `!(age + 2 < retireAgeA)` is `age + 2 >= retireAgeA`: the same boolean.)
- [ ] **Step 5: `buildTaxProfile` and `payrollTax`.** `buildTaxProfile` gains `streamPremiumA = 0, streamPremiumB = 0` and
  `Math.max(0, streamWagesA - streamWageCutA)` becomes `Math.max(0, streamWagesA - streamWageCutA - streamPremiumA)` (B
  likewise). `payrollTax` gains `streamPremiumA = 0, streamPremiumB = 0` and
  `taxableWagesA = Math.max(0, wageA - healthPremiumA) + Math.max(0, streamWagesA - streamPremiumA)` (B likewise). (`w - 0`
  is `w`, and `Math.max(0, w)` of a non-negative `w` is `w`.) Update `healthcareCost`'s Medicare comment: "Medicare
  starts at 65 for a partner without employer coverage (`workingX` here is employer coverage: a W-2 job still worked, or a
  W-2 stream with a premium)".
- [ ] **Step 6: Hooks** (after `// @@shared:block end`): extend `__test_streamAmountsForYear`'s returned object with
  `selfA, selfB, premiumA, premiumB, coverA, coverB`; add `window.__test_streamCoverBits = streamCoverBits;`.
- [ ] **Step 7: Run.** `node tests/se_health.js` passes; `node tests/income_streams.js`, `node tests/aca_coverage.js`,
  `node tests/medicare_enrollment.js`, `node tests/irmaa_gating.js`, `node tests/cliff_plan.js` pass; `node
  tests/snapshot.js` passes against the committed baseline (exactness gate). `npm test` green.
- [ ] **Step 8: Timing** (Global Constraints), both tables in the report.
- [ ] **Step 9: Commit.**
```bash
git add tests/se_health.js
git commit -m "E1c 2: employer health coverage (W-2 main job or a W-2 stream with a premium) drives marketplace, Medicare and IRMAA gating; stream premiums pre-tax (US; existing snapshots byte-identical)" -- Planner_US.html tests/se_health.js package.json
```

---

### Task 3: SE tax, payroll, the tax profile, the state base and the ACTC (US; existing snapshots byte-identical)

**Files:**
- Modify: `Planner_US.html`: a new `SS_WAGE_BASE` constant and `selfEmploymentTax` next to `wageFica` (~line 7880);
  `payrollTax`; the year loop (`seMainA/B`, `seA/B`, SE tax, `wages`); `buildTaxProfile`; `taxFor` (all three branches);
  `federalLiabilityForState` (earned-income argument only); hooks
- Create: `tests/self_employment.js`
- Modify: `package.json` (`test`: add `node tests/self_employment.js` right after `node tests/se_health.js`)

**Interfaces:**
- Consumes: Task 2's `streams.selfA/B`, `employerA/B`.
- Produces:
  - `const SS_WAGE_BASE = 184500;` (2026; `wageFica` reads it, same literal value).
  - `const SE_OUT = { tax: 0, half: 0, ne: 0 }; function selfEmploymentTax(se, ssWages, yearIndex, out)` -> `out`.
  - `payrollTax({ ..., seTaxA = 0, seTaxB = 0, seNeA = 0, seNeB = 0 })`.
  - year-loop consts `seMainA/B` (main self-employment profit), `seA/B`, `seTaxA/B`, `halfA/B`, `seNeA/B`.
  - `buildTaxProfile({ ..., seA = 0, seB = 0, halfA = 0, halfB = 0, soloCutA = 0, soloCutB = 0 })` (soloCut is 0 until
    Task 4); profile keys `seNetA`, `seNetB` (in `otherA/B` too), `seEarnedA`, `seEarnedB`.
  - hook `window.__test_selfEmploymentTax(se, ssWages, yearIndex)` -> a copy of `{ tax, half, ne }`.

- [ ] **Step 1: Write `tests/self_employment.js`** (boilerplate as `tests/income_streams.js`). Pure (`y = 0`, inflation 0):
  - `se 100,000, ssWages 0`: `ne 92,350`, `tax 14,129.55` (11,451.40 + 2,678.15), `half 7,064.775`;
  - `se 100,000, ssWages 150,000`: Social Security on `184,500 - 150,000 = 34,500` -> 4,278 + 2,678.15 = **6,956.15**;
  - `se 100,000, ssWages 200,000`: Medicare only, **2,678.15**;
  - `$400 floor`: `se 400` (`ne 369.40`) -> `tax 0, half 0, ne 0`; `se 434` (`ne 400.799`) -> `tax 61.322247` (to 1e-6);
  Payroll (`__test_payrollTax`, `filing 'single'`, year 0): `{ wageA: 180000, wageB: 0, healthPremiumA: 0, healthPremiumB: 0, seTaxA: 3236.15, seNeA: 92350 }`
  -> 13,770 + 3,236.15 + 0.009 x (272,350 - 200,000) = **17,657.30** (the 3,236.15 is `selfEmploymentTax(100000, 180000)`:
  558 + 2,678.15; assert that too).
  ACTC (`__test_tax.taxFor`, `tx`, profile literal as in `tests/income_streams.js` with `filing: 'mfj'` and one child age
  5): `wageA: 0, otherA: seNet, seNetA: 9293.5225, seEarnedA: 9293.5225` for `se 10,000` (`half 706.4775`) ->
  **-1,019.028375** (15% x (9,293.5225 - 2,500), refundable; no federal tax under the deduction; to 1e-6); the same with `seEarnedA: 0`
  -> **0**.
  State (synthetic flat-10% `zzx` with no deduction, as in `tests/state_extra_income.js`): single profile
  `otherA: 50000, seNetA: 50000, wageA: 0` -> state tax **5,000** (was 0 when self-employment did not reach the state).
  Engine (`__test_accountTrace`; base `{ singlePerson: true, ageA: 45, retireAgeA: 60, incomeA: 100000, incomeKindA: 'self', inflation: 0, incomeGrowth: 0, stateTax: 'tx', k401PctA: 0, catchupPctA: 0, iraPctA: 0, profitSharingPctA: 0, megaBackdoor: false, healthPremiumA: 0 }`):
  - year 0: `trace[0].ficaTax` is 14,129.55 (no W-2 wages); `trace[0].profile.seNetA` is 92,935.225; `profile.wageA` 0;
    `rows[0].wages` 100,000;
  - `retired self-employed`: `retireAgeA: 45` (retired now) -> `ficaTax 0`, `seNetA 0`;
  - `dies`: couple with `survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 47`, A self-employed -> year 2
    `ficaTax 0`;
  - `stale W-2 fields` (payroll part): `matchA: 50, healthPremiumA: 200` stored with `incomeKindA: 'self'` -> year 0
    `ficaTax` still 14,129.55 and `rows[0].wages` still 100,000 (no premium);
  - `legacy identical`: an all-W-2 household with `incomeKindA: 'wages'` present or absent: identical rows.
  End with the error check and `console.log('self_employment: SE tax passed')` (Task 4 appends).
- [ ] **Step 2: Run it; it fails** (`__test_selfEmploymentTax is not a function`).
- [ ] **Step 3: SE tax.** Next to `wageFica`:
```js
  const SS_WAGE_BASE = 184500; // 2026 Social Security wage base (SSA), indexed with taxIndexFactor
  // E1c: self-employment tax (IRC 1401, 1402) on one person's year of self-employment profit `se`. Net earnings are 92.35%
  // of profit; nothing is due under $400 of net earnings. Social Security (12.4%) stops at the wage base less that person's
  // W-2 Social Security wages; Medicare is 2.9% of all net earnings. `half` (IRC 164(f)) is deducted from income; the 0.9%
  // Additional Medicare Tax is figured in payrollTax on wages plus `ne`. Pure; fills `out`.
  const SE_OUT = { tax: 0, half: 0, ne: 0 };
  function selfEmploymentTax(se, ssWages, yearIndex, out) {
    const ne = 0.9235 * se;
    if (!(ne >= 400)) {
      out.tax = 0; out.half = 0; out.ne = 0;
      return out;
    }
    out.tax = 0.124 * Math.min(ne, Math.max(0, SS_WAGE_BASE * taxIndexFactor(yearIndex) - ssWages)) + 0.029 * ne;
    out.half = out.tax / 2;
    out.ne = ne;
    return out;
  }
```
  and in `wageFica` replace the literal `184500` by `SS_WAGE_BASE`.
- [ ] **Step 4: `payrollTax`.** Add `seTaxA = 0, seTaxB = 0, seNeA = 0, seNeB = 0` and return
  `wageFica(taxableWagesA, year) + wageFica(taxableWagesB, year) + seTaxA + seTaxB + additionalMedicareTax(taxableWagesA + seNeA, taxableWagesB + seNeB, filing)`
  (`(a + b) + 0 + 0` is `a + b`; `w + 0` is `w`).
- [ ] **Step 5: Year loop.** After the `wageA/wageB` consts:
```js
      // E1c: a self-employed partner's main income is business profit, not wages.
      const seMainA = workingA && state.incomeKindA === 'self' ? state.incomeA * incomeFactor : 0,
        seMainB = workingB && state.incomeKindB === 'self' ? state.incomeB * incomeFactor : 0;
```
  and change the two wage consts to `wageA = workingA && state.incomeKindA !== 'self' ? state.incomeA * incomeFactor : 0`
  (B likewise). `healthPremiumA/B` are then gated by `employerA/B`'s main-job part: change `workingA ?` to
  `workingA && state.incomeKindA !== 'self' ?` in `healthPremiumA` (B likewise). After `listAmountsForYear` and the
  `employerA/B` consts:
```js
      const seA = seMainA + streams.selfA,
        seB = seMainB + streams.selfB;
      let seTaxA = 0, halfA = 0, seNeA = 0, seTaxB = 0, halfB = 0, seNeB = 0;
      if (seA > 0) {
        selfEmploymentTax(seA, Math.max(0, wageA - healthPremiumA) + Math.max(0, streams.wagesA - streams.premiumA), year, SE_OUT);
        seTaxA = SE_OUT.tax; halfA = SE_OUT.half; seNeA = SE_OUT.ne;
      }
      if (seB > 0) {
        selfEmploymentTax(seB, Math.max(0, wageB - healthPremiumB) + Math.max(0, streams.wagesB - streams.premiumB), year, SE_OUT);
        seTaxB = SE_OUT.tax; halfB = SE_OUT.half; seNeB = SE_OUT.ne;
      }
```
  `wages` appends `+ seMainA + seMainB` (the `self` streams are already in `extraIncome`). Pass `seA, seB, halfA, halfB`
  to `buildTaxProfile`, and `seTaxA, seTaxB, seNeA, seNeB` to the `payrollTax` call.
- [ ] **Step 6: `buildTaxProfile`.** New parameters `seA = 0, seB = 0, halfA = 0, halfB = 0, soloCutA = 0, soloCutB = 0`.
```js
    // E1c: self-employment net of half the SE tax and the deductible Solo 401(k) money; it is in `other` (AGI, MAGI) and,
    // as seNet, reaches the state's wages; seEarned (net of half the SE tax only) is earned income for the ACTC.
    const seNetA = seA > 0 ? Math.max(0, seA - halfA - soloCutA) : 0,
      seNetB = seB > 0 ? Math.max(0, seB - halfB - soloCutB) : 0;
    const otherA = profileWageA + pensionA + rmdA + streamOtherA + seNetA,
      otherB = profileWageB + pensionB + rmdB + streamOtherB + seNetB;
```
  Normal profile: `seNetA, seNetB, seEarnedA: seA > 0 ? seA - halfA : 0, seEarnedB: seB > 0 ? seB - halfB : 0,`.
  A-deceased remap: `seNetA: seNetB, seNetB: 0, seEarnedA: seB > 0 ? seB - halfB : 0, seEarnedB: 0,` (`otherA: otherB`
  already carries `seNetB`).
- [ ] **Step 7: `taxFor`.** Add at the top, with `extraA`: `seNetA = profile.seNetA || 0, seNetB = profile.seNetB || 0,
  seEarnedA = profile.seEarnedA || 0, seEarnedB = profile.seEarnedB || 0,`. Joint branch: `sources.wages = profile.wageA +
  profile.wageB + invOrd + (extraA + extraB) + (seNetA + seNetB);`; `childCredits(..., profile.wageA + profile.wageB +
  (seEarnedA + seEarnedB))` and the same earned argument in its `federalLiabilityForState` call. Single branch:
  `sources.wages = profile.wageA + invOrd + extraA + seNetA;`, earned `profile.wageA + seEarnedA` (both calls). Two-filer
  branch: `sourcesA.wages = profile.wageA + invA + extraA + seNetA;`, `sourcesB.wages = profile.wageB + invB + extraB +
  seNetB;`, A's credits and A's lagged pass earned `profile.wageA + seEarnedA`, B's lagged pass `profile.wageB + seEarnedB`.
- [ ] **Step 8: Hook:** `window.__test_selfEmploymentTax = (se, w, y) => ({ ...selfEmploymentTax(se, w, y, SE_OUT) });`.
- [ ] **Step 9: Run.** `node tests/self_employment.js` passes; `node tests/income_streams.js`, `node
  tests/additional_medicare_tax.js`, `node tests/child_credits.js`, `node tests/state_extra_income.js`, `node
  tests/tax_caches.js`, `node tests/survivor_symmetry.js` pass; `node tests/snapshot.js` passes against the committed
  baseline. `npm test` green.
- [ ] **Step 10: Commit.**
```bash
git add tests/self_employment.js
git commit -m "E1c 3: self-employment tax, payroll, AGI and state base, ACTC earned income (US; existing snapshots byte-identical)" -- Planner_US.html tests/self_employment.js package.json
```

---

### Task 4: The Solo 401(k) (US; existing snapshots byte-identical)

**Files:**
- Modify: `Planner_US.html`: `soloPlanContributions` + scratch just above `retirementContributions`;
  `retirementContributions` (arguments, the Solo call, totals, `acct`, return); the year loop's call and its
  `buildTaxProfile` call; hooks
- Modify: `tests/self_employment.js` (Solo part)

**Interfaces:**
- Consumes: `STREAM_OUT.contrib` (items with `stream.kind 'self'`), `STREAM_ROOMS` after `streamPlanContributions`,
  `allocatePlanRoom`, `PLAN_LIMITS`, `pct`; Task 3's `seA/B`, `halfA/B`.
- Produces:
  - `const SOLO_IN` (input scratch, below), `SOLO_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, cut: [0, 0] }`,
    `NO_SOLO` (same shape, never written), `SOLO_P`, `SOLO_GOT` (arrays of length `LIST_MAX + 1`).
  - `function soloPlanContributions(p, out)` -> `out`.
  - `retirementContributions({ ..., seA = 0, seB = 0, seMainA = 0, seMainB = 0, halfA = 0, halfB = 0 })` additionally
    returns `soloCutA`, `soloCutB`; its `traditionalContrib`, `rothContrib`, `acct` include the Solo money (never
    `employerContrib`: all Solo money is the household's own cash).
  - hook `window.__test_soloPlanContributions(p)` (fills `SOLO_IN` from a plain object, returns copies of `out` and of
    `p.rooms` after the call).

- [ ] **Step 1: Extend `tests/self_employment.js`** (Solo part; `L` limits 2026, factor 1). Hand values (se = 100,000:
  half 7,064.775, C = 92,935.225):
  - `25% profit sharing`: main profit 100,000, rate 25, nothing else: `P = C x 0.25 / 1.25 = 18,587.045` -> `trad[1]`
    18,587.045, `cut[0]` the same, `employeeTrad` the same;
  - `10%`: `P = C / 11 = 8,448.656818...` (to 1e-6);
  - `deferral and after-tax`: deferral 100% (room 24,500), rate 25, mega on 100%: deferral 24,500 traditional, P 18,587.045,
    after-tax `min(47,500 - 18,587.045, 92,935.225 - 18,587.045 - 24,500) = 28,912.955` -> `roth[1]` 28,912.955,
    `trad[1]` 43,087.045 (all additions 72,000);
  - `compensation limit`: se 1,000,000 (half 24,829.75, C 975,170.25), rate 10, no deferral: `P = min(C / 11, 0.10 x 360,000) = 36,000`;
  - `room binds`: se 1,000,000, rate 25, deferral 100%: P limited to the room `min(72,000, C - P) - 24,500 = 47,500`;
  - `deferral room after W-2`: rooms `deferral [12,250, 0]` (a W-2 job used 12,250), deferral 100% -> 12,250;
  - `catch-up at 55, no Roth rule`: rooms `deferral [24,500, 0], catchUp [8,000, 0]`, se 300,000, main deferral and
    catch-up 100%, `mainRoth false` -> `trad[1]` includes 32,500 (no part forced to Roth);
  - `IRA on self-employment pay`: se 5,000 (half 353.23875, C 4,646.76125), IRA 100%, Roth IRA, no 401(k) money ->
    `roth[0] 4,646.76125`; se 20,000, traditional IRA -> `trad[0] 7,500`, `cut[0] 7,500`;
  - `two sources`: main 60,000 (rate 25) and a `self` stream 40,000 of A (`contribute: true`, `deferralPct 0`, `profitSharingPct 10`): C from se 100,000; `P_main = 0.6C x 0.2`,
    `P_stream = 0.4C / 11`;
  - `owner B`: a `self` stream owned by B -> slots `trad[3]`, `cut[1]`;
  - `self stream match ignored`: a `self` stream with `matchPct: 50` and rate 0 -> no `trad[1]` money besides deferrals;
  - engine `lands and leaves cash` (`__test_accountTrace`, single, A 45 self-employed 100,000, `k401PctA 100`,
    `profitSharingPctA 25`, `returnRate 0, bondReturn 0, hysaRate 0, bondYears 0`, `taxable: 2000000, spending: 50000`):
    `trace[0].trad[1] - state.trad401kA === 24500 + 18587.045`; `trace[0].profile.seNetA === 92935.225 - 24500 - 18587.045`;
    `rows[0]` cash flow: the Solo money is subtracted (compare `rows[0].cash` / `taxable` against the same household with
    rate 0 and deferral 0: lower by the after-tax cost);
  - `stale W-2 fields` (contribution part): `matchA: 50` with `incomeKindA: 'self'` -> no match anywhere (`trad[1]` as above).
  Print `self_employment: all passed` at the end.
- [ ] **Step 2: Run it; it fails** (`__test_soloPlanContributions is not a function`).
- [ ] **Step 3: `soloPlanContributions`** just above the `PLAN_REQ` lines:
```js
  // E1c: the Solo 401(k) and IRA money of self-employment, after every W-2 plan (salary, W-2 streams). Pure (inputs in
  // `p`, results in `out`; no allocation). All of one person's self-employment is one business: one compensation
  // C = se - half the SE tax, one annual-additions room (IRC 415(c), common control), deferrals within the per-person room
  // the W-2 plans left (402(g)). Per person: deferrals (the main income, then `self` streams in list order), profit sharing
  // per source P_i = C_i x r / (1 + r) with the compensation limit (P = r x (C - P)), the room, after-tax money, then the
  // IRA on W-2 pay plus C less the traditional Solo money. No Roth catch-up rule (it keys on FICA wages). Every dollar is
  // the household's own cash. Slots: ACCOUNT_SLOTS order (IRA A, 401(k) A, IRA B, 401(k) B).
  const SOLO_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, cut: [0, 0] },
    NO_SOLO = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, cut: [0, 0] },
    SOLO_P = new Array(LIST_MAX + 1).fill(0),
    SOLO_GOT = new Array(LIST_MAX + 1).fill(0),
    SOLO_IN = {
      se: [0, 0], half: [0, 0], main: [0, 0], w2Comp: [0, 0], iraLeft: [0, 0],
      mainPct: [{ deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }, { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }],
      list: null, rooms: null, annualAdditions: 0, compensation: 0, mainRoth: false, iraPretax: false, megaOn: false,
    };
  function soloPlanContributions(p, out) {
    for (let k = 0; k < 4; k++) { out.trad[k] = 0; out.roth[k] = 0; }
    out.employeeTrad = 0; out.employeeRoth = 0; out.cut[0] = 0; out.cut[1] = 0;
    for (let o = 0; o < 2; o++) {
      const se = p.se[o];
      if (!(se > 0)) continue;
      const C = Math.max(0, se - p.half[o]), m = p.mainPct[o], main = p.main[o] > 0, list = p.list, rooms = p.rooms;
      let base = 0, cu = 0, trad = 0, roth = 0;
      // 1. Deferrals, at most the compensation left.
      if (main) {
        const b = Math.min(rooms.deferral[o], C - base - cu) * pct(m.deferral);
        rooms.deferral[o] -= b; base += b;
        const c = Math.min(rooms.catchUp[o], C - base - cu) * pct(m.catchUp);
        rooms.catchUp[o] -= c; cu += c;
        if (p.mainRoth) roth += b + c; else trad += b + c;
      }
      for (let i = 0; i < list.n; i++) {
        const it = list.items[i], s = it.stream;
        if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
        const want = Math.min(rooms.deferral[o] + rooms.catchUp[o], C - base - cu) * pct(s.deferralPct),
          b = Math.min(want, rooms.deferral[o]);
        rooms.deferral[o] -= b; rooms.catchUp[o] -= want - b; base += b; cu += want - b;
        if (s.deferralType === 'roth') roth += want; else trad += want;
      }
      // 2-3. Profit sharing per source, then the one annual-additions room (catch-ups outside it).
      let n = 0, sumP = 0;
      if (C > 0) {
        if (main) {
          const r = pct(m.profit), Ci = (C * p.main[o]) / se;
          SOLO_P[n++] = Math.min((Ci * r) / (1 + r), (r * p.compensation * Ci) / C);
        }
        for (let i = 0; i < list.n; i++) {
          const it = list.items[i], s = it.stream;
          if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
          const r = pct(s.profitSharingPct), Ci = (C * it.pay) / se;
          SOLO_P[n++] = Math.min((Ci * r) / (1 + r), (r * p.compensation * Ci) / C);
        }
      }
      for (let k = n; k < SOLO_P.length; k++) SOLO_P[k] = 0;
      for (let k = 0; k < n; k++) sumP += SOLO_P[k];
      let left = allocatePlanRoom(Math.max(0, Math.min(p.annualAdditions, C - sumP) - base), SOLO_P, SOLO_GOT),
        profit = 0;
      for (let k = 0; k < n; k++) profit += SOLO_GOT[k];
      trad += profit;
      // 4. After-tax money, at most the compensation left.
      let afterTax = 0;
      if (main && p.megaOn) {
        const a = Math.min(left, Math.max(0, C - profit - base - cu - afterTax)) * pct(m.afterTax);
        left -= a; afterTax += a;
      }
      for (let i = 0; i < list.n; i++) {
        const it = list.items[i], s = it.stream;
        if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
        const a = Math.min(left, Math.max(0, C - profit - base - cu - afterTax)) * pct(s.afterTaxPct);
        left -= a; afterTax += a;
      }
      roth += afterTax;
      // 5. IRA: compensation is W-2 pay plus C less the traditional Solo money.
      let iraRoom = Math.max(0, Math.min(p.iraLeft[o], p.w2Comp[o] + C - trad)), ira = 0;
      if (main) { const x = iraRoom * pct(m.ira); iraRoom -= x; ira += x; }
      for (let i = 0; i < list.n; i++) {
        const it = list.items[i], s = it.stream;
        if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
        const x = iraRoom * pct(s.personalPct);
        iraRoom -= x; ira += x;
      }
      out.trad[o * 2 + 1] = trad;
      out.roth[o * 2 + 1] = roth;
      if (p.iraPretax) out.trad[o * 2] = ira; else out.roth[o * 2] = ira;
      out.employeeTrad += trad + (p.iraPretax ? ira : 0);
      out.employeeRoth += roth + (p.iraPretax ? 0 : ira);
      out.cut[o] = trad + (p.iraPretax ? ira : 0);
    }
    return out;
  }
```
  Check `allocatePlanRoom`'s loop reads `amounts.length` and gives 0 to a zero amount (it does at `ee7a789`: "a negative
  amount gets 0"); the unused tail of `SOLO_P` is zeroed above.
- [ ] **Step 4: `retirementContributions`.** Add `seA = 0, seB = 0, seMainA = 0, seMainB = 0, halfA = 0, halfB = 0` to the
  arguments. (A self-employed partner's `wageA` is 0, so the salary's deferral, catch-up, IRA, match, profit sharing and
  mega amounts are all 0 with no new code: Review Focus 2.) After the `const sp = streamPlanContributions(...)` line:
```js
    // E1c: the Solo 401(k) and IRA of self-employment, after every W-2 plan (the rooms the salary and W-2 streams left).
    let so = NO_SOLO;
    if (seA + seB > 0) {
      const P = SOLO_IN;
      P.se[0] = seA; P.se[1] = seB; P.half[0] = halfA; P.half[1] = halfB; P.main[0] = seMainA; P.main[1] = seMainB;
      P.mainPct[0].deferral = state.k401PctA; P.mainPct[0].catchUp = state.catchupPctA; P.mainPct[0].profit = state.profitSharingPctA;
      P.mainPct[0].afterTax = state.megaPctA; P.mainPct[0].ira = state.iraPctA;
      P.mainPct[1].deferral = state.k401PctB; P.mainPct[1].catchUp = state.catchupPctB; P.mainPct[1].profit = state.profitSharingPctB;
      P.mainPct[1].afterTax = state.megaPctB; P.mainPct[1].ira = state.iraPctB;
      P.w2Comp[0] = wageA + streamWagesA - iraA - (sp.trad[0] + sp.roth[0]);
      P.w2Comp[1] = wageB + streamWagesB - iraB - (sp.trad[2] + sp.roth[2]);
      P.iraLeft[0] = iraLimitA - iraA - (sp.trad[0] + sp.roth[0]);
      P.iraLeft[1] = iraLimitB - iraB - (sp.trad[2] + sp.roth[2]);
      P.list = streamList; P.rooms = STREAM_ROOMS;
      P.annualAdditions = annualAdditionLimit; P.compensation = compLimit;
      P.mainRoth = state.k401Type === 'roth'; P.iraPretax = state.iraType === 'traditional'; P.megaOn = !!state.megaBackdoor;
      so = soloPlanContributions(P, SOLO_PLAN);
    }
```
  (Check the names `annualAdditionLimit`, `compLimit`, `iraLimitA/B` against the function at `ee7a789`; the E1b
  `STREAM_LIMITS` lines use the first two.) Then append, never insert: `rothContrib = rothContribA + rothContribB +
  sp.employeeRoth + so.employeeRoth`, `traditionalContrib = traditionalContribSalary + sp.employeeTrad + so.employeeTrad`,
  each `acct.trad[k]` / `acct.roth[k]` gets `+ so.trad[k]` / `+ so.roth[k]` after its `+ sp...` term, and the return gains
  `soloCutA: so.cut[0], soloCutB: so.cut[1]`. `employerContrib` is unchanged.
- [ ] **Step 5: Year loop.** Pass `seA, seB, seMainA, seMainB, halfA, halfB` to `retirementContributions` (its call is
  after the SE-tax block of Task 3: move the SE-tax block above the call if it is not), and `soloCutA, soloCutB` from its
  result to `buildTaxProfile`.
- [ ] **Step 6: Hook:**
```js
  window.__test_soloPlanContributions = (q) => {
    const P = SOLO_IN;
    for (const k of ['se', 'half', 'main', 'w2Comp', 'iraLeft']) { P[k][0] = q[k][0]; P[k][1] = q[k][1]; }
    for (let o = 0; o < 2; o++) Object.assign(P.mainPct[o], { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }, q.mainPct[o]);
    P.list = { n: q.list.length, items: q.list };
    P.rooms = JSON.parse(JSON.stringify(q.rooms));
    Object.assign(P, { annualAdditions: q.annualAdditions, compensation: q.compensation, mainRoth: !!q.mainRoth, iraPretax: !!q.iraPretax, megaOn: !!q.megaOn });
    soloPlanContributions(P, SOLO_PLAN);
    return { out: JSON.parse(JSON.stringify(SOLO_PLAN)), rooms: P.rooms };
  };
```
  (`half` in the test comes from `__test_selfEmploymentTax`; `list` items are `{ owner, pay, stream }`.)
- [ ] **Step 7: Run.** `node tests/self_employment.js` passes; `node tests/stream_contributions.js`, `node
  tests/contribution_limits.js`, `node tests/account_ledger.js`, `node tests/account_inputs.js` pass; `node
  tests/snapshot.js` passes against the committed baseline. `npm test` green.
- [ ] **Step 8: Commit.**
```bash
git commit -m "E1c 4: Solo 401(k) and IRA from self-employment (deferral room after W-2 plans, profit sharing C x r / (1 + r), one annual-additions room per person; all from household cash) (US; existing snapshots byte-identical)" -- Planner_US.html tests/self_employment.js
```

---

### Task 5: The self-employed health insurance deduction inside the MAGI iteration (US; existing snapshots byte-identical)

**Files:**
- Modify: `Planner_US.html`: `seHealthDeduction` + `SE_HEALTH` near `healthcareCost`; `healthcareCost` (per-person
  premiums on two returns); `returnMagis`; `buildTaxProfile` (`seAllowA/B`, `seHealthA/B`); `taxFor` (all branches);
  the year loop (allow flags, `magiBase`, the three-estimate iteration, `passLog`, `naturalRec`, `trialRecs`, the
  restore points, the forced pass, `prevSeHealthA/B`); hooks
- Modify: `tests/se_health.js` (deduction part)

**Interfaces:**
- Consumes: Task 2's `employerA/B`; Task 3/4's `seNetA/B` on the profile.
- Produces:
  - `healthcareCost` returns `{ healthcare, ltc, usesMagiEstimate, premA, premB }` (`premA/B` are each person's own part,
    only filled on two returns; 0 otherwise).
  - `const SE_HEALTH = [0, 0]; function seHealthDeduction(healthcare, premA, premB, twoReturns, profile, out)` -> `out`.
  - profile keys `seAllowA`, `seAllowB` (booleans), `seHealthA`, `seHealthB` (set every MAGI pass).
  - `buildTaxProfile({ ..., seAllowA = false, seAllowB = false })`.
  - hook `window.__test_seHealthDeduction(healthcare, premA, premB, twoReturns, profile)` -> `[a, b]` copy.

- [ ] **Step 1: Extend `tests/se_health.js`** (deduction part). Pure (`__test_seHealthDeduction`):
  - joint, `seAllowA true, seNetA 8000, seAllowB false, seNetB 50000`, healthcare 12,000 -> `[8000, 0]`;
  - joint, both allowed (`seNetA 8000, seNetB 50000`) -> `[8000, 4000]`;
  - two returns, `premA 7000, premB 5000`, both allowed, `seNetA 3000, seNetB 10000` -> `[3000, 5000]`;
  - not allowed -> `[0, 0]`.
  Engine (`__test_accountTrace` trace `profile` copies; rows):
  - `fixed point`: `{ singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 60000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, taxable: 0, cash: 0, hysaRate: 0, k401PctA: 0, profitSharingPctA: 0, iraPctA: 0 }`
    (and every retirement account 0): se 60,000 -> half 4,238.865, seNet 55,761.135. Year 0: `H = rows[0].healthcare`,
    `M = rows[0].magiProxy`, `D = trace[0].profile.seHealthA`: `|D - min(H, 55761.135)| <= 1e-9`, `|M - (55761.135 - D)| <= 2`,
    `|H - __test_tax.acaNetCost(M, 1, 18000, 0)| <= 2` (check `acaNetCost`'s argument order against its definition);
  - `cap`: the same with `incomeA: 3000` (seNet 2,788.05...) -> `D === seNetA` (the cap binds);
  - `ticked spouse plan, married`: couple, A self-employed 80,000, B W-2 90,000 working, `employerCoversSpouseB: true`,
    `filingStatus: 'mfj'` -> `rows[0].healthcare === 0` and `profile.seHealthA === 0`; unticked -> A on the marketplace,
    `seHealthA > 0`;
  - `survivor self-employed`: `survivorEnabled, survivorPartner: 'A', survivorDeathAge: 51` (A 50), B self-employed
    60,000 retiring at 60, A retired: year 1 (A's death year) the remapped profile has `seNetA` = B's net and
    `seHealthA <= seNetA`; `ficaTax` equals `__test_selfEmploymentTax(60000, 0, 1).tax`;
  - `unmarried Medicare`: `filingStatus: 'single'` couple, A 66 self-employed 50,000 (retire 70), B 60 W-2 working,
    `employerCoversSpouseB: true`, `medicareYearly: 10000`: A on Medicare (65+), `profile.seHealthA > 0` (A's half of
    Medicare at least); the same with `filingStatus: 'mfj'` -> `seHealthA === 0` (spouse's employer plan available);
  - `no double count`: the fixed-point household with `ltcEnabled` off: `profile.medicalExpense === H - D` (to 1e-9);
  - `legacy identical`: an all-W-2 ACA household (R-like, `acaEnabled: true`) with and without the new keys: identical
    rows (`JSON.stringify`).
  End with `console.log('se_health: all passed')`.
- [ ] **Step 2: Run it; it fails** (`__test_seHealthDeduction is not a function`).
- [ ] **Step 3: `healthcareCost` per-person parts.** Add `let premA = 0, premB = 0;`. In the two-return ACA branch
  compute the two `acaNetCost(...)` calls into consts `ca`, `cb`, then `healthcare = ca + cb; premA = ca; premB = cb;` (the
  same sum as before). In the flat-premium `else` branch, `if (twoReturns) { premA = inflate(acaEligibleA ? state.healthcare / 2 : 0); premB = inflate(acaEligibleB ? state.healthcare / 2 : 0); }`.
  After the Medicare line: `if (twoReturns) { premA += inflate(medicareEligibleA ? state.medicareYearly / 2 : 0); premB += inflate(medicareEligibleB ? state.medicareYearly / 2 : 0); }`.
  In both IRMAA branches, compute each surcharge into a const, add it to `healthcare` exactly as now, and when
  `twoReturns` also to `premA` / `premB`. Return `{ healthcare, ltc, usesMagiEstimate, premA, premB }`. (`healthcare` is
  built by the same operations in the same order: no number changes.)
- [ ] **Step 4: `seHealthDeduction`** below `healthcareCost`:
```js
  // E1c: the self-employed health insurance deduction (IRC 162(l)) for the year's premiums (`healthcare`: marketplace after
  // the credit, the flat premium, Medicare and IRMAA; all of it is insurance for the household). A person may deduct it
  // only in a year without employer coverage of their own or through a spouse (profile.seAllowX), up to their net
  // self-employment (seNetX: profit less half the SE tax and the deductible Solo 401(k) money). One return: the
  // household's premiums, up to both caps (either spouse may claim the family's). Two returns: each person's own part
  // (premA includes the children). Pure; fills `out`.
  const SE_HEALTH = [0, 0];
  function seHealthDeduction(healthcare, premA, premB, twoReturns, profile, out) {
    const capA = profile.seAllowA ? profile.seNetA || 0 : 0,
      capB = profile.seAllowB ? profile.seNetB || 0 : 0;
    if (twoReturns) {
      out[0] = Math.min(premA, capA);
      out[1] = Math.min(premB, capB);
    } else {
      const total = Math.min(healthcare, capA + capB);
      out[0] = Math.min(total, capA);
      out[1] = total - out[0];
    }
    return out;
  }
```
- [ ] **Step 5: Allow flags and the profile.** In the year loop, after `filing` is known:
```js
      // E1c: 162(l) is barred in a year the person has employer coverage, or could join a spouse's employer plan (an
      // unticked box means no affordable offer; an unmarried partner's employer never bars it).
      const jointYear = filingRow(filing).joint && !singlePerson && !isSurvivorPeriod,
        seAllowA = seA > 0 && !employerA && !(jointYear && employerB && state.employerCoversSpouseB),
        seAllowB = seB > 0 && !employerB && !(jointYear && employerA && state.employerCoversSpouseA);
```
  Pass both to `buildTaxProfile` (new parameters `seAllowA = false, seAllowB = false`). Normal profile: `seAllowA,
  seAllowB, seHealthA: 0, seHealthB: 0,`; A-deceased remap: `seAllowA: seAllowB, seAllowB: false, seHealthA: 0,
  seHealthB: 0,`.
- [ ] **Step 6: `returnMagis`** subtracts each return's deduction (exact zero for everyone else):
  `return [profile.otherA - (profile.seHealthA || 0) + profile.ssA + inv + trad * s + gain / 2, profile.otherB - (profile.seHealthB || 0) + profile.ssB + inv + trad * (1 - s) + gain / 2];`
- [ ] **Step 7: `taxFor`.** At the top: `seHA = profile.seHealthA || 0, seHB = profile.seHealthB || 0,`. Joint branch:
  `other = profile.otherA + profile.otherB - (seHA + seHB) + gains + traditionalExtra + invOrd;` and
  `ordinary = profile.otherA + profile.otherB - (seHA + seHB) + traditionalExtra + invOrd + taxableSS;` (`(a + b) - 0` is
  `a + b`); `sources.wages`' last term becomes `+ (seNetA - seHA + (seNetB - seHB))`. Single branch: `profile.otherA -
  seHA + ...` in the `taxableSocialSecurity` argument and in `ordinary`; `sources.wages`' last term `+ (seNetA - seHA)`.
  Two-filer branch: `profile.otherA - seHA + gainA + tradA + invA`, `ordinaryA = profile.otherA - seHA + tradA + ...`, the
  same with `seHB` for B, and `sourcesA.wages` / `sourcesB.wages` last terms `+ (seNetA - seHA)` / `+ (seNetB - seHB)`.
- [ ] **Step 8: The year loop's MAGI iteration.** Read "MAGI iteration (both engines)" and "Per-year solver and the cliff
  plan" in `CLAUDE.md` first.
  1. Next to `let prevDiscTraditional = 0, prevTaxableGainGross = 0;` add `prevSeHealthA = 0, prevSeHealthB = 0`.
  2. `const magiBase = otherA + otherB + ss + inv.ordinary + inv.qualified;` becomes `const magiBase0 = ...same...; let
     magiBase = magiBase0;`, and `let estTrad = ..., estGain = ...,` gains `estSeA = prevSeHealthA, estSeB = prevSeHealthB,`.
  3. At the top of each pass, right after `profile.ownerShareA = ownerShareA0;`:
     `profile.seHealthA = estSeA; profile.seHealthB = estSeB; magiBase = magiBase0 - estSeA - estSeB;`
     (every MAGI the pass builds, `preConvMagi`, `costAt`, `irmaaAt`, `magiProxy`, the plan's cap and fill, and
     `returnMagis`, then carries the estimated deduction; `x - 0 - 0` is `x`).
  4. After `const hcOut = healthcareCost(hcArgs); let healthcare = hcOut.healthcare;` and before
     `profile.medicalExpense = ...`:
```js
        // E1c: the 162(l) deduction this pass's premiums allow (taxFor reads it); the MAGI it sets is checked below.
        let seRealA = 0, seRealB = 0;
        if (profile.seAllowA || profile.seAllowB) {
          seHealthDeduction(healthcare, hcOut.premA, hcOut.premB, twoReturns, profile, SE_HEALTH);
          seRealA = SE_HEALTH[0]; seRealB = SE_HEALTH[1];
        }
        profile.seHealthA = seRealA;
        profile.seHealthB = seRealB;
```
     and `profile.medicalExpense = healthcare + ltc;` becomes `profile.medicalExpense = healthcare + ltc - (seRealA + seRealB);`
     (deducted premiums are not also medical expenses).
     **Restore the estimate in the profile before any MAGI is built from it again:** `costAt` and `irmaaAt` run after this
     point (forced pass, `passLog`, the plan's candidates) and read `magiBase` (still the estimate: correct) and
     `returnMagis(profile, ...)` (which now reads the realized deduction). Make `returnMagis` consistent by having
     `costAt` / `irmaaAt` set `profile.seHealthA = estSeA; profile.seHealthB = estSeB;` before their `returnMagis` call and
     put the realized pair back after it (two assignments each way, only when `twoReturns`).
  5. Convergence: `unconverged = estUsed && Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain) +
     Math.abs(seRealA - estSeA) + Math.abs(seRealB - estSeB) > MAGI_ITER_TOL;` (terms appended). In the damped update add
     `estSeA += w * (seRealA - estSeA); estSeB += w * (seRealB - estSeB);`.
  6. Carry `estSeA, estSeB` wherever `estTrad, estGain` are stored or restored: the `passLog.push({...})` entry, the
     forced-pass `pick` restore, both `naturalRec = {...}` literals (also add `seA: seRealA, seB: seRealB`, the realized
     pair), the `trialRecs.push({...})` entry, the restore from `naturalRec` (`estSeA = naturalRec.estSeA`...), from `best`,
     and the replay restore that sets `estGain = naturalRec.gain` (set `estSeA = naturalRec.seA; estSeB = naturalRec.seB;`).
     List every site you changed in the report, with its line.
  7. Forced pass (`if (forcedPass && flow < 0) {`): after `healthcare = realizedCost;` recompute the deduction from the
     realized cost when `profile.seAllowA || profile.seAllowB` (on two returns use the `premA/premB` of a
     `healthcareCost(hcArgs)` call made at the realized MAGI inside `costAt`: keep `costAt`'s last result object in a
     `let lastCost` and read it here), set `profile.seHealthA/B`, and recompute `profile.medicalExpense` as in item 4
     before `taxAfter`.
  8. After the year converged, next to `prevDiscTraditional = ...`: `prevSeHealthA = naturalRec ? naturalRec.seA :
     seRealA; prevSeHealthB = naturalRec ? naturalRec.seB : seRealB;` (match the `naturalRec ? ... : ...` pattern used
     there; if the kept phase is a trial, use what that line uses for the other two).
- [ ] **Step 9: Hook:** `window.__test_seHealthDeduction = (h, a, b, two, p) => [...seHealthDeduction(h, a, b, two, p, SE_HEALTH)];`.
- [ ] **Step 10: Run.** `node tests/se_health.js` passes; `node tests/aca_magi_iteration.js`, `node
  tests/two_return_magi.js`, `node tests/irmaa_magi.js`, `node tests/aca_medicaid.js`, `node tests/cliff_plan.js`, `node
  tests/cliff_guard.js`, `node tests/deductions.js`, `node tests/tax_caches.js` pass; `node tests/snapshot.js` passes
  against the committed baseline. `npm test` green.
- [ ] **Step 11: Timing** (Global Constraints), both tables in the report.
- [ ] **Step 12: Commit.**
```bash
git commit -m "E1c 5: self-employed health insurance deduction (162(l)) inside the MAGI iteration, with the spouse-plan bar and no double count as a medical expense (US; existing snapshots byte-identical)" -- Planner_US.html tests/se_health.js
```

---

### Task 6: QBI, the new scenarios and the badge (US; existing snapshots byte-identical, seven new entries)

**Files:**
- Modify: `Planner_US.html`: `QBI_LIMITS` + `qbiDeduction` just above `taxFor`; `taxFor` (all branches);
  `federalLiabilityForState`; hooks; badge `V124` -> `V125`
- Create: `tests/qbi.js`; Modify: `package.json` (`test`: add `node tests/qbi.js` right after `node tests/self_employment.js`)
- Modify: `tests/snapshot_scenarios.js` (seven new US scenarios), `test_self_employment.js` (part 2)
- Update (allowed, new entries only): `tests/snapshots/us.json`

**Interfaces:**
- Consumes: profile `seNetA/B`, `seHealthA/B`.
- Produces: `const QBI_LIMITS = { threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum: 400, minimumQbi: 1000 };`,
  `function qbiDeduction(qbi, taxable, netGain, joint, yearIndex)` -> number;
  `federalLiabilityForState(status, year, ages, ordinary, gains, propertyTax, mortgageInterest, dependents, earned, medical = 0, qbiBase = 0)`;
  hook `window.__test_qbiDeduction = qbiDeduction`.

- [ ] **Step 1: Write `tests/qbi.js`** (boilerplate as above; `state.inflation = 0` unless a case says otherwise). Pure
  (`joint false` unless said):
  - `qbi 50,000, taxable 80,000, netGain 0` -> **10,000**;
  - `inside the range`: `qbi 100,000, taxable 239,250` (threshold + 37,500, ap 0.5) -> 0.2 x 100,000 x 0.25 = **5,000**;
  - `above the range`: `qbi 100,000, taxable 300,000` -> **400** (the minimum; QBI >= 1,000);
  - `cap with gains`: `qbi 50,000, taxable 60,000, netGain 30,000` -> **6,000**;
  - `minimum`: `qbi 1,500, taxable 50,000` -> **400**; `qbi 900, taxable 50,000` -> **180**;
  - `joint`: `qbi 100,000, taxable 478,500` (403,500 + 75,000) -> **5,000**;
  - `indexing`: `state.inflation = 10`, year index 1 (check `taxIndexFactor(1)` is 1.1 with the hook `__test_tax.taxIndexFactor`;
    if it differs, use its value `f` in place of 1.1): threshold `201,750 f`, width 75,000: `taxable = 201,750 f + 37,500`
    -> 5,000 for `qbi 100,000`; the minimum is `400 f`.
  `taxFor` (`tx`, profile literal, single, `seNetA 50,000, otherA 50,000`, no wages): equals the same profile's tax
  without `seNetA` minus the QBI's tax effect worked by hand: taxable before QBI `50,000 - 16,100 = 33,900` (check the 2026
  single standard deduction `16,100` in `STD_DEDUCTION`), QBI `min(10,000, 6,780) = 6,780`, ordinary tax on 27,120 against
  33,900 at 2026 brackets (10% to 12,400, 12% above: 1,240 + 12% x (27,120 - 12,400) = 3,006.40 against 1,240 + 12% x
  21,500 = 3,820): **difference 813.60** (check the 2026 bracket edges in `ORDINARY_BRACKETS` and recompute if they
  differ, showing the arithmetic in a comment).
  Engine: the Task 3 single self-employed household (`tx`, no children): with `p = trace[0].profile`,
  `__test_tax.taxFor(p, 0, 0) - __test_tax.taxFor({ ...p, seNetA: 0 }, 0, 0)` equals `-(ordinaryTax(o, 0, 'single', d) -
  ordinaryTax(o, 0, 'single', d + q))` with `o` the profile's ordinary income, `d` the standard deduction and
  `q = qbiDeduction(p.seNetA - p.seHealthA, o - d, 0, false, 0)` (worked in the test from the hooks; in `tx` and with no
  children `seNetA` changes nothing else); an all-W-2 household is identical (`JSON.stringify(rows)` with and without
  the new keys).
  End with `console.log('qbi: all passed')`.
- [ ] **Step 2: Run it; it fails** (`__test_qbiDeduction is not a function`).
- [ ] **Step 3: `qbiDeduction`** just above `taxFor`:
```js
  // E1c: the qualified business income deduction (IRC 199A), federal only, below AGI. 2026 limits from Rev. Proc. 2025-32
  // section 4.26 (threshold indexed; the phase-in width is a fixed statutory amount since OBBBA section 70105). Every
  // business is treated as a specified service business with no W-2 wages and no property (owner decision): full 20%
  // up to the threshold, 20% x ap^2 inside the range, nothing above; capped at 20% of taxable income less net capital
  // gain (which includes qualified dividends). The $400 minimum (IRC 199A(i), $1,000 of QBI) applies after the cap.
  const QBI_LIMITS = { threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum: 400, minimumQbi: 1000 };
  function qbiDeduction(qbi, taxable, netGain, joint, yearIndex) {
    if (!(qbi > 0)) return 0;
    const f = taxIndexFactor(yearIndex),
      threshold = (joint ? QBI_LIMITS.threshold.joint : QBI_LIMITS.threshold.other) * f,
      width = joint ? QBI_LIMITS.width.joint : QBI_LIMITS.width.other,
      ap = Math.min(1, Math.max(0, 1 - (taxable - threshold) / width)),
      d = Math.min(0.2 * qbi * ap * ap, 0.2 * Math.max(0, taxable - netGain));
    return qbi >= QBI_LIMITS.minimumQbi * f ? Math.max(d, QBI_LIMITS.minimum * f) : d;
  }
```
- [ ] **Step 4: `taxFor`.** Joint branch, after `deduction` is computed:
```js
      const qbi = seNetA + seNetB > 0
        ? qbiDeduction(seNetA - seHA + (seNetB - seHB), Math.max(0, ordinary + gains - deduction), gains, true, profile.year)
        : 0;
```
  and pass `deduction + qbi` (not `deduction`) to `ordinaryTax` and `longTermGainTax` (`d + 0` is `d`). Single branch: the
  same with `seNetA - seHA` and `joint = false`. Two-filer branch: `qbiA` from `seNetA - seHA` against `ordinaryA + gainA -
  deductionA`, `qbiB` likewise, both `joint = false`; use `deductionA + qbiA` in every `ordinaryTax` / `longTermGainTax`
  call for A (including `federalA` for the credits) and `deductionB + qbiB` for B. Lagged pass:
  `federalLiabilityForState(..., medical = 0, qbiBase = 0)` computes, when `qbiBase > 0`,
  `q = qbiDeduction(qbiBase, Math.max(0, ordinary + gains - deduction), gains, filingRow(status).joint, year)` and uses
  `deduction + q` in its two tax calls; pass `seNetA + seNetB - seHA - seHB` (joint), `seNetA - seHA` (single, A of two
  filers), `seNetB - seHB` (B) as the new last argument at each call site.
- [ ] **Step 5: Hook:** `window.__test_qbiDeduction = qbiDeduction;`.
- [ ] **Step 6: Run.** `node tests/qbi.js` passes; `node tests/tax_brackets.js`, `node tests/state_reference.js`, `node
  tests/state_7d_households.js`, `node tests/tax_caches.js`, `node tests/self_employment.js`, `node tests/se_health.js`
  pass; `node tests/snapshot.js` passes against the committed baseline (still no new scenario).
- [ ] **Step 7: New scenarios** (US standard list, after `R stream contributions`):
```js
    ['R self-employed A, B W-2 covers', { ...R, retireAgeA: 60, retireAgeB: 58, incomeA: 120000, incomeB: 90000, incomeKindA: 'self', acaEnabled: true }],
    ['R self-employed A, marketplace', { ...R, retireAgeA: 60, retireAgeB: 58, incomeA: 120000, incomeB: 90000, incomeKindA: 'self', acaEnabled: true, employerCoversSpouseB: false }],
    ['R single self-employed ACA line', { ...R, singlePerson: true, retireAgeA: 60, incomeA: 55000, incomeKindA: 'self', acaEnabled: true }],
    ['R side business stream', { ...R, acaEnabled: true, incomeSources: [{ amount: 40000, startAge: 52, endAge: 60, followGrowth: true, growth: 3, owner: 'A', kind: 'self', contribute: true, deferralType: 'traditional', deferralPct: 100, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 25, healthPremium: 0 }] }],
    ['R solo 401k 25% mega', { ...R, retireAgeA: 60, incomeA: 200000, incomeKindA: 'self', k401PctA: 100, profitSharingPctA: 25, megaBackdoor: true, megaPctA: 100 }],
    ['R self-employed past 65', { ...R, ageA: 63, ageB: 61, retireAgeA: 70, retireAgeB: 61, incomeA: 80000, incomeKindA: 'self' }],
    ['R W-2 stream premium', { ...R, acaEnabled: true, incomeSources: [{ amount: 30000, startAge: 52, endAge: 58, followGrowth: true, growth: 3, owner: 'A', kind: 'wages', healthPremium: 6000 }] }],
```
  `npm run snapshot:update`; `git diff tests/snapshots/us.json` shows exactly these seven added entries and their
  historical runs, no changed line; the UI snapshot must not change (if `snapshot_ui.js --update` rewrote `ui_us.json`
  with only the timing-flaky `histSuccess` text, restore it).
- [ ] **Step 8: `test_self_employment.js` part 2:** clicking `#incomeKindASelfBtn` on a working partner changes
  `window.fireProjectionRows[0].tax` and lowers `fireProjectionRows[0].wages` by the health premium no longer paid when a
  per-paycheck premium was set; a `self` stream with `#incSrc0Contribute` and `#incSrc0ProfitSharingPct` 25 raises the next
  row's `traditional`. Run it.
- [ ] **Step 9: Badge** US `V124` -> `V125`. `npm test` green.
- [ ] **Step 10: Timing** (Global Constraints), both tables. Plus, recorded only: in a scratch script (not committed),
  31 interleaved rounds of 400 `__test_simulateRaw()` on `R side business stream`'s state against the same state with the
  stream's `kind: 'wages'`, both on the working tree; report the two medians.
- [ ] **Step 11: Commit.**
```bash
git commit -m "E1c 6: qualified business income deduction (specified service, no employees; 2026 Rev. Proc. 2025-32 limits, the \$400 minimum); seven new scenarios (new entries only); US V125" -- Planner_US.html tests/qbi.js package.json tests/snapshot_scenarios.js tests/snapshots/us.json test_self_employment.js
```
  (`git add tests/qbi.js` first.)

---

### Task 7: Docs and the implementation notes

**Files:**
- Modify: `README.md` (US: self-employment as a main income or stream: SE tax, Solo 401(k), marketplace or spouse plan
  with the 162(l) deduction, QBI; the W-2 stream premium as coverage; the not-modeled items a user could assume: S corps,
  business losses, Social Security credit from SE earnings)
- Modify: `CLAUDE.md`: the tests list (`tests/self_employment.js`, `tests/se_health.js`, `tests/qbi.js`,
  `test_self_employment.js`); "MAGI iteration (both engines)": the third estimate (`estSeA/B`, `magiBase` per pass,
  `returnMagis` subtracting `seHealthA/B`, the sites that carry it); "US federal deductions": QBI and 162(l); a new
  paragraph "Self-employment (US, E1c)" next to "Contribution limits and profit sharing" (income kinds, `seMainX` vs
  `wageX`, `employerA/B` replacing `workingX` in health rules, `selfEmploymentTax`, `soloPlanContributions`,
  `seHealthDeduction`, `qbiDeduction`, the profile keys `seNetA/B`, `seEarnedA/B`, `seAllowA/B`, `seHealthA/B`); the
  income-streams paragraph: kind `self`, `profitSharingPct`, `healthPremium`.
- Modify: `docs/next-batches-plan.md`: a new `##### E1c: implementation (US V124 -> V125)` block right after the E1c
  design block (before `---` / `## Batch 4`), in the E1b block's shape: commits with hashes, the red-then-green table, the
  legacy proof, the list of MAGI-iteration sites changed, the snapshot notes (seven entries added, no existing entry
  changed), timing tables per measured task and the side-business timing, and "For the owner" items.

- [ ] **Step 1:** Write the three edits (text to a file, then insert with a node script; keep CRLF).
- [ ] **Step 2:** `npm test` green (docs only).
- [ ] **Step 3: Commit.**
```bash
git commit -m "E1c 7: README, CLAUDE.md and implementation notes (docs only)" -- README.md CLAUDE.md docs/next-batches-plan.md
```

Report to the owner: the branch tip, each commit's hash and one-line summary, the red runs, the legacy proof, the
MAGI-iteration sites changed, the timing tables for Tasks 2, 5 and 6 and the side-business timing, and anything that did
not go as planned.
