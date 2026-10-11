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
  gate; on a difference, stop and find the changed sum order, never update). Task 6 adds the eight new scenarios: the json
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
    self-employment tax) and choose Self-employed below." Their `<small>` "Gross wages, before tax and 401(k)/IRA
    contributions" becomes "Gross wages or business profit, before tax and contributions".
  - the 401(k) contribution A / B tooltips: append " Self-employed: this is your Solo 401(k) contribution." The mega
    backdoor tooltip: append " A Solo 401(k) allows it only if its plan document permits after-tax contributions."
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
  - `kind`: `options: [['other', 'Not earned'], ['wages', 'W-2 wages'], ['self', 'Self-employment']]`; in its tip replace
    "It does not change Medicare or ACA eligibility or the main job's contributions." by "It does not change the main
    job's contributions; with a health premium entered, this job is the owner's health coverage (no marketplace, and
    Medicare waits until it ends)." and append: " Self-employment: business profit; it pays self-employment tax, can fund
    the owner's Solo 401(k) (shared with a self-employed main income) and IRA, and stops in the owner's death year."
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
  - `IRMAA lookback (cover2)`: `ageA: 62, retireAgeA: 62`, a W-2 stream owner A age 60-66 with a premium: `trace[y].medA`
    (Step 6 adds it to the trace) is false for y = 1..2 (A 63-64: at 65-66 A is still covered) and true for y = 3..4
    (A 65-66: the stream ends at 66, so at 67-68 A is on Medicare); without the stream it is true from y = 1;
  - `self-employed partner, Medicare at 65`: single, `ageA: 64, retireAgeA: 68, incomeKindA: 'self', incomeA: 50000`:
    `rows[0].healthcare === 18000` (marketplace, ACA modeling off), `rows[1].healthcare === 10000` (A 65: Medicare, not
    the employer plan a W-2 worker would stay on; at 65 the marketplace premium stops);
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
  `selfA, selfB, premiumA, premiumB, coverA, coverB`; add `window.__test_streamCoverBits = streamCoverBits;`. In the year
  loop's `trace.push({ ... })` entry (test-only; it already carries `profile` and `ficaTax`) add `medA, medB` (they are
  in scope there: both sit in the pass body; if not, say so and hoist them).
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
  - `buildTaxProfile({ ..., seA = 0, seB = 0, halfA = 0, halfB = 0, soloPlanCutA = 0, soloPlanCutB = 0, soloIraCutA = 0, soloIraCutB = 0 })`
    (the cuts are 0 until Task 4); profile keys `seNetA`, `seNetB` (the AGI part, in `otherA/B` too), `sePlanNetA`,
    `sePlanNetB` (net of the plan money only: the 162(l) cap and the QBI base, Tasks 5-6), `seEarnedA`, `seEarnedB`.
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
  - year 0: `trace[0].ficaTax` is 14,129.55 (no W-2 wages); `trace[0].profile.seNetA` and `sePlanNetA` are 92,935.225;
    `profile.wageA` 0;
    `rows[0].wages` 100,000;
  - `retired self-employed`: `retireAgeA: 45` (retired now) -> `ficaTax 0`, `seNetA 0`;
  - `dies`: couple (`singlePerson: false, incomeB: 0, ageB: 45, retireAgeB: 45`: B retired with no pay, so the defaults'
    working Partner B adds no payroll tax) with `survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 47`, A
    self-employed -> year 1 `ficaTax` 14,129.55 and year 2 `ficaTax 0`;
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
  `workingA && state.incomeKindA !== 'self' ?` in `healthPremiumA` (B likewise). **Placement:** the block below reads
  `healthPremiumA/B` and `streams`, and Task 4 passes its results to `retirementContributions`: put it after the
  `healthPremiumA/B` consts and before the `retirementContributions({...})` call (~line 10101), not merely after
  `listAmountsForYear` (a `const` used before its line is a TDZ error):
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
- [ ] **Step 6: `buildTaxProfile`.** New parameters `seA = 0, seB = 0, halfA = 0, halfB = 0, soloPlanCutA = 0, soloPlanCutB = 0,
  soloIraCutA = 0, soloIraCutB = 0`.
```js
    // E1c: self-employment net of half the SE tax and the deductible Solo 401(k) and traditional IRA money (seNet: in
    // `other`, so AGI and MAGI, and in the state's wages); sePlanNet is net of the plan money only (IRC 401(c)(2) earned
    // income: the 162(l) cap, and the QBI base, Treas. Reg. 1.199A-3(b)(1)(vi); an IRA deduction reduces neither);
    // seEarned (net of half the SE tax only) is earned income for the ACTC.
    const sePlanNetA = seA > 0 ? Math.max(0, seA - halfA - soloPlanCutA) : 0,
      sePlanNetB = seB > 0 ? Math.max(0, seB - halfB - soloPlanCutB) : 0,
      seNetA = seA > 0 ? Math.max(0, seA - halfA - soloPlanCutA - soloIraCutA) : 0,
      seNetB = seB > 0 ? Math.max(0, seB - halfB - soloPlanCutB - soloIraCutB) : 0;
    const otherA = profileWageA + pensionA + rmdA + streamOtherA + seNetA,
      otherB = profileWageB + pensionB + rmdB + streamOtherB + seNetB;
```
  Normal profile: `seNetA, seNetB, sePlanNetA, sePlanNetB, seEarnedA: seA > 0 ? seA - halfA : 0, seEarnedB: seB > 0 ? seB - halfB : 0,`.
  A-deceased remap: `seNetA: seNetB, seNetB: 0, sePlanNetA: sePlanNetB, sePlanNetB: 0, seEarnedA: seB > 0 ? seB - halfB : 0,
  seEarnedB: 0,` (`otherA: otherB` already carries `seNetB`).
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
  - `const SOLO_IN` (input scratch, below), `SOLO_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, planCut: [0, 0], iraCut: [0, 0] }`,
    `NO_SOLO` (same shape, never written), `SOLO_P`, `SOLO_GOT` (arrays of length `LIST_MAX + 1`).
  - `function soloPlanContributions(p, out)` -> `out`.
  - `retirementContributions({ ..., seA = 0, seB = 0, seMainA = 0, seMainB = 0, halfA = 0, halfB = 0 })` additionally
    returns `soloPlanCutA/B` (traditional deferral + profit sharing) and `soloIraCutA/B` (traditional IRA); its `traditionalContrib`, `rothContrib`, `acct` include the Solo money (never
    `employerContrib`: all Solo money is the household's own cash).
  - hook `window.__test_soloPlanContributions(p)` (fills `SOLO_IN` from a plain object, returns copies of `out` and of
    `p.rooms` after the call).

- [ ] **Step 1: Extend `tests/self_employment.js`** (Solo part; `L` limits 2026, factor 1). Hand values (se = 100,000:
  half 7,064.775, C = 92,935.225):
  - `25% profit sharing`: main profit 100,000, rate 25, nothing else: `P = C x 0.25 / 1.25 = 18,587.045` -> `trad[1]`
    18,587.045, `planCut[0]` the same, `iraCut[0]` 0, `employeeTrad` the same;
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
    `roth[0] 4,646.76125`; se 20,000, traditional IRA -> `trad[0] 7,500`, `iraCut[0] 7,500`, `planCut[0] 0` (the IRA is not plan money);
  - `two sources`: main 60,000 (rate 25) and a `self` stream 40,000 of A (`contribute: true`, `deferralPct 0`, `profitSharingPct 10`): C from se 100,000; `P_main = 0.6C x 0.2`,
    `P_stream = 0.4C / 11`;
  - `owner B`: a `self` stream owned by B -> slots `trad[3]`, `planCut[1]`;
  - `self stream match ignored`: a `self` stream with `matchPct: 50` and rate 0 -> no `trad[1]` money besides deferrals;
  - engine `lands and leaves cash` (`__test_accountTrace`, single, A 45 self-employed 100,000, `k401PctA 100`,
    `profitSharingPctA 25`, `returnRate 0, bondReturn 0, hysaRate 0, bondYears 0`, `taxable: 2000000, spending: 50000`):
    `|trace[0].trad[1] - state.trad401kA - (24500 + 18587.045)| < 1e-6` (ledger balances are share x pool: use a
    tolerance, never `===`); `|trace[0].profile.seNetA - (92935.225 - 24500 - 18587.045)| < 1e-6`; with `iraPctA 100` and
    `iraType: 'traditional'` added, `profile.sePlanNetA` is unchanged and `profile.seNetA` is 7,500 lower;
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
  const SOLO_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, planCut: [0, 0], iraCut: [0, 0] },
    NO_SOLO = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, planCut: [0, 0], iraCut: [0, 0] },
    SOLO_P = new Array(LIST_MAX + 1).fill(0),
    SOLO_GOT = new Array(LIST_MAX + 1).fill(0),
    SOLO_IN = {
      se: [0, 0], half: [0, 0], main: [0, 0], w2Comp: [0, 0], iraLeft: [0, 0],
      mainPct: [{ deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }, { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }],
      list: null, rooms: null, annualAdditions: 0, compensation: 0, mainRoth: false, iraPretax: false, megaOn: false,
    };
  function soloPlanContributions(p, out) {
    for (let k = 0; k < 4; k++) { out.trad[k] = 0; out.roth[k] = 0; }
    out.employeeTrad = 0; out.employeeRoth = 0; out.planCut[0] = 0; out.planCut[1] = 0; out.iraCut[0] = 0; out.iraCut[1] = 0;
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
      out.planCut[o] = trad; // section 404 plan money: reduces the 162(l) cap and QBI
      out.iraCut[o] = p.iraPretax ? ira : 0; // section 219: deducted from income only
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
  `soloPlanCutA: so.planCut[0], soloPlanCutB: so.planCut[1], soloIraCutA: so.iraCut[0], soloIraCutB: so.iraCut[1]`.
  `employerContrib` is unchanged.
- [ ] **Step 5: Year loop.** Pass `seA, seB, seMainA, seMainB, halfA, halfB` to `retirementContributions` (its call is
  after the SE-tax block of Task 3: move the SE-tax block above the call if it is not), and `soloPlanCutA/B`, `soloIraCutA/B` from its
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
  restore points, the forced pass, `realizedMagi`, `prevSeHealthA/B`); `solveRothConversionTo` (the 162(l) deduction,
  owner decision 8c); hooks
- Modify: `tests/se_health.js` (deduction part)

**Interfaces:**
- Consumes: Task 2's `employerA/B`; Task 3/4's `seNetA/B` and `sePlanNetA/B` on the profile.
- Produces:
  - `healthcareCost` returns `{ healthcare, ltc, usesMagiEstimate, premA, premB }` (`premA/B` are each person's own part,
    only filled on two returns; 0 otherwise).
  - `const SE_HEALTH = [0, 0]; function seHealthDeduction(healthcare, premA, premB, twoReturns, profile, out)` -> `out`.
  - profile keys `seAllowA`, `seAllowB` (booleans), `seHealthA`, `seHealthB` (set every MAGI pass).
  - `buildTaxProfile({ ..., seAllowA = false, seAllowB = false })`.
  - hook `window.__test_seHealthDeduction(healthcare, premA, premB, twoReturns, profile)` -> `[a, b]` copy.

- [ ] **Step 1: Extend `tests/se_health.js`** (deduction part). Pure (`__test_seHealthDeduction`):
  - joint, `seAllowA true, sePlanNetA 8000, seAllowB false, sePlanNetB 50000`, healthcare 12,000 -> `[8000, 0]`;
  - joint, both allowed (`sePlanNetA 8000, sePlanNetB 50000`) -> `[8000, 4000]`;
  - two returns, `premA 7000, premB 5000`, both allowed, `sePlanNetA 3000, sePlanNetB 10000` -> `[3000, 5000]`;
  - the cap is the plan net, not the AGI net: `seAllowA true, sePlanNetA 8000, seNetA 500` (a 7,500 traditional IRA),
    healthcare 12,000 -> `[8000, 0]`;
  - not allowed -> `[0, 0]`.
  Engine (`__test_accountTrace` trace `profile` copies; rows):
  - `fixed point`: `{ singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 60000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, taxable: 0, cash: 0, hysaRate: 0, k401PctA: 0, profitSharingPctA: 0, iraPctA: 0 }`
    (and every retirement account 0): se 60,000 -> half 4,238.865, seNet 55,761.135. Year 0: `H = rows[0].healthcare`,
    `M = rows[0].magiProxy`, `D = trace[0].profile.seHealthA`: `|D - min(H, 55761.135)| <= 1e-9`, `|M - (55761.135 - D)| <= 2`,
    `|H - __test_tax.acaNetCost(M, 1, 18000, 0)| <= 2` (check `acaNetCost`'s argument order against its definition);
  - `ACA off still converges`: the fixed-point household with `acaEnabled: false`, `incomeGrowth: 5` and `medicalInflation`
    at its default (the deduction changes every year, the premium does not depend on MAGI and no conversion ceiling is
    finite): for every working year y, `|rows[y].magiProxy - (seNet_y - trace[y].profile.seHealthA)| <= 1` with `seNet_y`
    from `trace[y].profile.seNetA` (fails without site 7's `estUsed` line: the MAGI keeps the previous year's deduction);
  - `cap`: the same with `incomeA: 3000` (sePlanNet 2,788.05675) -> `D === sePlanNetA` (the cap binds);
  - `ticked spouse plan, married`: couple, A self-employed 80,000, B W-2 90,000 working, `employerCoversSpouseB: true`,
    `filingStatus: 'mfj'` -> `rows[0].healthcare === 0` and `profile.seHealthA === 0`; unticked -> A on the marketplace,
    `seHealthA > 0`;
  - `survivor self-employed` (on the Task 2 base, which has `inflation: 0, incomeGrowth: 0`: the stated figures depend on
    it): `survivorEnabled, survivorPartner: 'A', survivorDeathAge: 51` (A 50), B self-employed 60,000 retiring at 60, A
    retired: year 1 (A's death year) the remapped profile has `seNetA` and `sePlanNetA` = B's net and `seHealthA <=
    sePlanNetA`; `ficaTax` equals `__test_selfEmploymentTax(60000, 0, 1).tax`;
  - `unmarried Medicare`: `filingStatus: 'single'` couple, A 66 self-employed 50,000 (retire 70), B 60 W-2 working,
    `employerCoversSpouseB: true`, `medicareYearly: 10000`: A on Medicare (65+), `profile.seHealthA > 0` (A's half of
    Medicare at least); the same with `filingStatus: 'mfj'` -> `seHealthA === 0` (spouse's employer plan available);
  - `no double count`: the fixed-point household with `ltcEnabled` off: `profile.medicalExpense === H - D` (to 1e-9);
  - `two returns under 65 with a child`: `filingStatus: 'single'` couple, both 50 and retired except A self-employed
    40,000 (retire 60), B retired with no pay, one child born 2018 (`children: [{ birthYear: 2018, student: false }]`),
    `acaEnabled: true`: `trace[0].profile.seHealthA` equals `min(A's part, sePlanNetA)` where A's part is
    `__test_tax.acaNetCost(rows[0].magiA, 2, 9000, 0)` (A's household: A and the child; half the 18,000 premium), within 2;
    `seHealthB === 0` (B has no self-employment);
  - `no consistent answer` (decision 8b): single, the fixed-point household with `incomeA: 82000` (sePlanNet 76,206.89: inside the band where below the 400% line the deduction lifts MAGI over it and above it pulls MAGI under):
    every row finite; `window.__test_magiStats` (an object: read `forced` and `unresolved` before and after the run) shows
    the year counted as `forced` or `unresolved`; and the charged premium, the deduction and the recorded MAGI agree:
    `|D - min(H, sePlanNet)| <= 1e-9` and `|rows[0].magiProxy - (sePlanNet - D)| <= 1`;
  - `cliff plan replay`: the `R side business stream` household of Task 6 Step 7 (an early retiree with a `self` stream,
    ACA on): as `tests/cliff_plan.js` does (`__test_refreshCliffPlan()`, then `__test_runPlanMode({ planMode: 'choose' })` and
    `__test_runPlanMode({ planMode: 'apply', plan: { intents: ch.intents } })`), the apply run equals the choose run row
    for row (`JSON.stringify(rows)`); and with `plan: { intents }` where every intent's line id is replaced by one that
    does not exist, `window.__test_planStats.absent` (an object, cumulative: read it before and after) has grown and the rows equal the `off` run (the natural year replayed). If `choose` records no intent for this household, raise the stream until the natural MAGI
    sits just over the 400% line (so a stay-under is chosen) and name the amount used in the report;
  - `historical path`: the fixed-point household through `__test_accountTrace(undefined, undefined, rowFn)` with a
    constant-return `rowFn` (as `tests/historical_parity.js` builds one): every year's `profile.seHealthA` is finite and
    `<= sePlanNetA`, and year 0's `D` equals the standard run's within 2;
  - `legacy identical`: an all-W-2 ACA household (R-like, `acaEnabled: true`) with and without the new keys: identical
    rows (`JSON.stringify`).
  End with `console.log('se_health: all passed')`.
- [ ] **Step 2: Run it; it fails** (`__test_seHealthDeduction is not a function`).
- [ ] **Step 3: `healthcareCost` per-person parts.** Add `let premA = 0, premB = 0;`. In the two-return ACA branch
  compute the two `acaNetCost(...)` calls into consts `ca`, `cb`, then `healthcare = ca + cb; premA = ca; premB = cb;` (the
  same sum as before). In the flat-premium `else` branch, `if (twoReturns) { premA = inflate(acaEligibleA ? state.healthcare / 2 : 0); premB = inflate(acaEligibleB ? state.healthcare / 2 : 0); }`.
  After the Medicare line: `if (twoReturns) { premA += inflate(medicareEligibleA ? state.medicareYearly / 2 : 0); premB += inflate(medicareEligibleB ? state.medicareYearly / 2 : 0); }`.
  In both IRMAA branches, compute each surcharge into a const INSIDE its existing `if (medicareEligibleX)` (so no extra
  `irmaaSurcharge` call is made on the hot path), add it to `healthcare` exactly as now, and when `twoReturns` also to
  `premA` / `premB`. Return `{ healthcare, ltc, usesMagiEstimate, premA, premB }`. (`healthcare` is
  built by the same operations in the same order: no number changes.)
- [ ] **Step 4: `seHealthDeduction`** between `healthcareCost`'s closing brace and the line
  `// @@shared:nextGuardrailMultiplier begin` (~line 8764; never inside or past that marker):
```js
  // E1c: the self-employed health insurance deduction (IRC 162(l)) for the year's premiums (`healthcare`: marketplace after
  // the credit, the flat premium, Medicare and IRMAA; all of it is insurance for the household). A person may deduct it
  // only in a year without employer coverage of their own or through a spouse (profile.seAllowX), up to their net
  // self-employment earned income (sePlanNetX: profit less half the SE tax and the Solo 401(k) plan money, IRC 401(c)(2);
  // a traditional IRA does not reduce it). One return: the
  // household's premiums, up to both caps (either spouse may claim the family's). Two returns: each person's own part
  // (premA includes the children). Pure; fills `out`.
  const SE_HEALTH = [0, 0];
  function seHealthDeduction(healthcare, premA, premB, twoReturns, profile, out) {
    const capA = profile.seAllowA ? profile.sePlanNetA || 0 : 0,
      capB = profile.seAllowB ? profile.sePlanNetB || 0 : 0;
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
  plan" in `CLAUDE.md` first. Every site below was traced at `ee7a789` (line numbers drift as you edit: search for the
  quoted code). The rule: the deduction is a third estimate (`estSeA`, `estSeB`) that travels everywhere `estTrad` /
  `estGain` travel; within a pass every MAGI is built from the estimate (through `magiBase` and the profile's
  `seHealthA/B`), and `taxFor` and the end-of-year history read the realized pair.

  **Edits (in file order):**

  | # | Line | Search for | Edit |
  |---|---|---|---|
  | 1 | 10031 | `let prevDiscTraditional = 0,` | add `prevSeHealthA = 0, prevSeHealthB = 0,` to the same `let` |
  | 2 | 10181 | `const magiBase = otherA + otherB + ss + inv.ordinary + inv.qualified;` | `const magiBase0 = otherA + otherB + ss + inv.ordinary + inv.qualified;` and on the next line `let magiBase = magiBase0;` |
  | 3 | 10182-10189 | `// MAGI iteration: estTrad/estGain are the discretionary traditional` ... `let estTrad = prevDiscTraditional,` | add `estSeA = prevSeHealthA, estSeB = prevSeHealthB,` before `estUsed = false;`, and extend the comment above it: "estSeA/estSeB are the self-employed health insurance deductions (E1c) the pass's MAGI assumes; they converge with the other two" |
  | 4 | 10234 | `profile.ownerShareA = ownerShareA0;` (top of each pass) | right after it: `profile.seHealthA = estSeA; profile.seHealthB = estSeB; magiBase = magiBase0 - estSeA - estSeB;` |
  | 5 | 10307-10313 | `const costAt = (trad, gain) => {` ... `return c;` | make it price at a given deduction pair, the pass's estimate by default (owner decision 8b): `let lastCost = null;` just above it, and the whole closure becomes the code block 'site 5' below. With the default pair its first line is `magiBase0 - estSeA - estSeB + trad + gain`, the very expression `magiBase + trad + gain` was (site 4), so every existing caller (`yearPlanCandidates`' `premiumAt`, the plan's cliff cost) is unchanged |
  | 6 | 10332-10335 | `const irmaaAt = (trad, gain) => {` / `const [ma, mb] = returnMagis(profile, trad, gain);` | the same save / set-estimate / restore around that one `returnMagis` call |
  | 7 | 10390-10397 | `const hcOut = healthcareCost(hcArgs);` ... `profile.medicalExpense = healthcare + ltc;` | insert the `seRealA / seRealB` block AFTER `let healthcare = hcOut.healthcare;` (it reads `healthcare`) (code below, which also sets `estUsed`: without it a year with ACA modeling off and no finite conversion ceiling never checks the deduction estimate, and the year's MAGI keeps last year's deduction) between them; the medical line becomes `profile.medicalExpense = healthcare + ltc - (seRealA + seRealB);` |
  | 8 | 10509-10510 | `const unconverged =` / `estUsed && Math.abs(realizedTrad - estTrad) + Math.abs(taxableGainGross - estGain) > MAGI_ITER_TOL;` | append `+ Math.abs(seRealA - estSeA) + Math.abs(seRealB - estSeB)` before `> MAGI_ITER_TOL` |
  | 9 | 10513 | `passLog.push({ estTrad, estGain, charged: healthcare, realized: costAt(traditionalGross, taxableGainGross) });` | add `estSeA, estSeB,` after `estGain,`, and price `realized` on the realized pair: `costAt(traditionalGross, taxableGainGross, seRealA, seRealB)` (decision 8b: the forced pass must see what the realized deduction costs) |
  | 10 | 10518-10519 | `estTrad += w * (realizedTrad - estTrad);` / `estGain += w * (taxableGainGross - estGain);` | add `estSeA += w * (seRealA - estSeA); estSeB += w * (seRealB - estSeB);` |
  | 11 | 10530-10531 | `estTrad = pick.estTrad;` / `estGain = pick.estGain;` | add `estSeA = pick.estSeA; estSeB = pick.estSeB;` |
  | 12 | 10540-10547 | `if (forcedPass && flow < 0) {` ... `const realizedCost = costAt(traditionalGross, taxableGainGross),` ... `profile.medicalExpense = healthcare + ltc;` | price `realizedCost` on the realized pair (`costAt(traditionalGross, taxableGainGross, seRealA, seRealB)`); after `healthcare = realizedCost;`, re-run the deduction on the realized cost (code below), then the medical line becomes `profile.medicalExpense = healthcare + ltc - (seRealA + seRealB);` (so `taxAfter` reads the realized pair). Declare `seRealA` / `seRealB` with `let` at site 7 so this block can reassign them |
  | 13 | 10599 | `naturalRec = { plan: NO_PLAN, estTrad, estGain, forced: ...` (apply branch) | add `estSeA, estSeB, seA: seRealA, seB: seRealB,` after `estGain,` |
  | 14 | 10609 | `naturalRec = { plan: NO_PLAN, estTrad, estGain, forced: ...` (choose branch) | the same four fields |
  | 15 | 10628-10629 | `estTrad = naturalRec.estTrad;` / `estGain = naturalRec.estGain;` (apply fallback replay) | add `estSeA = naturalRec.estSeA; estSeB = naturalRec.estSeB;` |
  | 16 | 10642 | `trialRecs.push({ plan: yearPlan, estTrad, estGain, forced: ...` | add `estSeA, estSeB,` after `estGain,` |
  | 17 | 10656-10657 | `estTrad = best.estTrad;` / `estGain = best.estGain;` (winner replay; `best` may be `naturalRec`, which has the fields from 13/14) | add `estSeA = best.estSeA; estSeB = best.estSeB;` |
  | 18 | 10669-10670 | `estTrad = naturalRec.realizedTrad;` / `estGain = naturalRec.gain;` (trial start, seeded from the natural year's realized values) | add `estSeA = naturalRec.seA; estSeB = naturalRec.seB;` |
  | 18b | 10560 | `const realizedMagi = magiBase + traditionalGross + taxableGainGross;` | `const realizedMagi = magiBase0 - (seRealA + seRealB) + traditionalGross + taxableGainGross;` (the year's recorded MAGI follows the realized deduction, also after a forced pass; for everyone else `magiBase0 - 0` is `magiBase`) |
  | 19 | 10682-10683 | `prevDiscTraditional = naturalRec ? naturalRec.realizedTrad : realizedTrad;` / `prevTaxableGainGross = ...` | add `prevSeHealthA = naturalRec ? naturalRec.seA : seRealA; prevSeHealthB = naturalRec ? naturalRec.seB : seRealB;` |

  **Readers that need no edit** (they read `magiBase` or the profile at call time, so they get the pass's estimate, or,
  after site 7, the realized pair where that is what they want). Confirm each still holds after your edits and say so in
  the report:

  | Line | Code | Why it is right as is |
  |---|---|---|
  | 10250 | `const preConvMagi = magiBase + estTrad + estGain;` | `magiBase` holds the estimate (site 4) |
  | 10253 | `returnMagis(profile, estTrad, estGain)` | runs before site 7: the profile still holds the estimate |
  | 10308 | `hcArgs.magiProxy = magiBase + trad + gain;` (in `costAt`) | estimate via `magiBase` |
  | 10341 | `irmaaMagiOf(magiBase + trad + gain, ...)` (in `irmaaAt`) | estimate via `magiBase` |
  | 10361 | `magiProxy = magiBase + conversionAmount + estTrad + estGain;` | estimate |
  | 10369 | `[magiA, magiB] = returnMagis(profile, conversionAmount + estTrad, estGain);` | before site 7: estimate |
  | 10489 | `wd.magiCap = { limit: yearPlan.magi - magiBase, off: false };` | the plan's cap on the pass's MAGI scale |
  | 10492 | `const m = magiBase + wd.traditionalGross + wd.taxableGainGross;` (fill) | same scale |
  | 10236 / 10274 / 10394 | `estUsed = false;` (pass top), `if (magiCeiling < Infinity) estUsed = true;`, `if (usesMagiEstimate) estUsed = true;` | unchanged; site 7 adds the third setter |
  | 10310-10313 | `const c = healthcareCost(hcArgs).healthcare;` and the three `hcArgs` restores in `costAt` | site 5 changes only the first line; the restores stay |
  | 10380 / 10497 / 10725 | `let totalIncome = otherA + otherB + ss + ...`, `totalIncome = otherA + otherB + ss + ...`, `income: totalIncome,` | the row's `income` is income before the 162(l) deduction (it already differs from MAGI by nothing else); not a MAGI, left as is and named in the implementation notes |
  | 10569 | `const lo = magiBase + ladderGain,` | same scale as the lines |
  | 10576 | `magiThresholds({ year, filing, twoReturns, profile, preMagi: preConvMagi + conversionAmount, preMagiA: ..., ... })` | its MAGIs come from `preConvMagi` / `preMagiA/B` (estimate scale); it reads the profile only for `ownerShareA` and Social Security, never `seHealthA/B` |
  | 10606 and 9304 | `yearPlanCandidates({ ..., magiBase, premiumAt: costAt, irmaaAt })`; inside it `costNear = (m) => c.premiumAt(m - c.magiBase - gain, gain) + ...` | passes the value at call time (the estimate), and `premiumAt` / `irmaaAt` are `costAt` / `irmaaAt` (sites 5, 6) |
  | 10691 | `[magiHistoryA[year], magiHistoryB[year]] = returnMagis(profile, traditionalGross, taxableGainGross);` | after convergence the profile holds the realized pair: the history records the realized per-return MAGI |
  | 10722 / 10746-10747 | `magiProxy: realizedMagi,`, `row.magiA = magiHistoryA[year];` / `row.magiB = ...` | the row reads the two lines above |
  | (withdrawal) | `drawTaxable` / the traditional solvers call `taxFor(profile, ...)` | they run after site 7: the realized deduction, as the year's tax |
  | (pass start) | `conversionMagiCeiling({ ..., profile })`, `solveRothConversion(profile, ...)` | run before site 7 with the estimate in the profile; `solveRothConversionTo` reads `profile.otherA + profile.otherB` itself and subtracts the deduction only after Step 8b |

  `returnMagis` itself is defined at line 7232 (Step 6 above); no other `returnMagis` call exists in the file (check with a
  grep). The code for sites 5, 7 and 12:
```js
        // E1c, site 5: the healthcare cost at another (discretionary traditional + conversion, gains) pair and a 162(l)
        // deduction pair (the pass's estimate unless given): the forced pass prices the realized one, and 3C's solver prices
        // its candidates.
        let lastCost = null;
        const costAt = (trad, gain, sa = estSeA, sb = estSeB) => {
          hcArgs.magiProxy = magiBase0 - sa - sb + trad + gain;
          if (twoReturns) {
            const ra = profile.seHealthA, rb = profile.seHealthB;
            profile.seHealthA = sa;
            profile.seHealthB = sb;
            [hcArgs.magiA, hcArgs.magiB] = returnMagis(profile, trad, gain);
            profile.seHealthA = ra;
            profile.seHealthB = rb;
          }
          lastCost = healthcareCost(hcArgs);
          const c = lastCost.healthcare;
          hcArgs.magiProxy = magiProxy;
          hcArgs.magiA = magiA;
          hcArgs.magiB = magiB;
          return c;
        };
```
```js
        // E1c, site 7: the 162(l) deduction this pass's premiums allow (taxFor reads it); its MAGI is checked at site 8.
        let seRealA = 0, seRealB = 0;
        if (profile.seAllowA || profile.seAllowB) {
          seHealthDeduction(healthcare, hcOut.premA, hcOut.premB, twoReturns, profile, SE_HEALTH);
          seRealA = SE_HEALTH[0];
          seRealB = SE_HEALTH[1];
        }
        profile.seHealthA = seRealA;
        profile.seHealthB = seRealB;
        // The pass's MAGI used estSeA/estSeB: the convergence test (site 8) must check them.
        if (estSeA !== 0 || estSeB !== 0 || seRealA !== 0 || seRealB !== 0) estUsed = true;
```
```js
          // E1c, site 12: the deduction follows the premium actually charged.
          if (profile.seAllowA || profile.seAllowB) {
            seHealthDeduction(healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
            seRealA = SE_HEALTH[0];
            seRealB = SE_HEALTH[1];
            profile.seHealthA = seRealA;
            profile.seHealthB = seRealB;
          }
```
  (At site 12 `lastCost` is the result of the `costAt(traditionalGross, taxableGainGross, seRealA, seRealB)` call on the
  line above, so its `premA/premB` are the realized ones. In the band with no consistent answer, decision 8b, this is
  the existing cliff rule: the pass that overpaid least is re-run, the cost at the realized MAGI is charged with the
  refund to cash, and the deduction follows the premium charged.) Exactness: with no self-employment `seAllowA/B` are false, `seRealA/B` and
  `estSeA/B` stay 0, and every edited expression adds or subtracts an exact 0.
- [ ] **Step 8b: The Roth-conversion bracket fill** (owner decision 8c). In `solveRothConversionTo` (~line 7293) the two
  lines `const other = profile.otherA + profile.otherB + conv,` and `const other = profile.otherA + (profile.otherB || 0) + conv,`
  become `profile.otherA + profile.otherB - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv` and
  `profile.otherA + (profile.otherB || 0) - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv` (`x - 0` is `x`).
  QBI stays out of the fill (it under-converts a little for the self-employed; recorded in the spec's section 9). Test
  in `tests/se_health.js`: the fixed-point household with `acaEnabled: false` (the flat 18,000 premium, deducted in full; ACA
  off so no 400%-line ceiling caps the conversion), `rothConvEnabled: true`, conversion ages 50-55, `rothConvBracket: 22` and
  a 500,000 traditional IRA: year 0's `conversionAmount` (trace) exceeds the same household's with `healthcare: 0` (no
  deduction) by 18,000 within 1 (the fill sees AGI 18,000 lower; if the bracket room makes the difference smaller,
  assert it is positive and explain the figure in the report).
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

### Task 6: QBI, the new scenarios and the badge (US; existing snapshots byte-identical, eight new entries)

**Files:**
- Modify: `Planner_US.html`: `QBI_LIMITS` + `qbiDeduction` just above `taxFor`; `taxFor` (all branches);
  `federalLiabilityForState`; hooks; badge `V124` -> `V125`
- Create: `tests/qbi.js`; Modify: `package.json` (`test`: add `node tests/qbi.js` right after `node tests/self_employment.js`)
- Modify: `tests/snapshot_scenarios.js` (eight new US scenarios), `test_self_employment.js` (part 2)
- Update (allowed, new entries only): `tests/snapshots/us.json`

**Interfaces:**
- Consumes: profile `sePlanNetA/B` (the QBI base before 162(l)), `seHealthA/B`.
- Produces: `const QBI_LIMITS = { threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum: 400, minimumQbi: 1000 };`,
  `function qbiDeduction(qbi, taxable, netGain, joint, yearIndex)` -> number;
  `federalLiabilityForState(status, year, ages, ordinary, gains, propertyTax, mortgageInterest, dependents, earned, medical = 0, qbiBase = 0)`;
  hook `window.__test_qbiDeduction = qbiDeduction`.

- [ ] **Step 1: Write `tests/qbi.js`** (boilerplate as above; `state.inflation = 0` unless a case says otherwise). Pure
  (`joint false` unless said):
  - `qbi 50,000, taxable 80,000, netGain 0` -> **10,000**;
  - `inside the range`: `qbi 100,000, taxable 239,250` (threshold + 37,500, ap 0.5) -> 0.2 x 100,000 x 0.25 = **5,000**;
  - `above the range`: `qbi 100,000, taxable 300,000` -> **0** (an SSTB is not a qualified business above the range, so no
    $400 minimum: 199A(d)(1)(A), (d)(3), (i)(2));
  - `minimum inside the range`: `qbi 1,500, taxable 239,250` (ap 0.5: only 750 of QBI counts, under 1,000) ->
    0.2 x 1,500 x 0.25 = **75**; `qbi 3,000, taxable 239,250` (1,500 counts) -> **400** (0.2 x 3,000 x 0.25 = 150, raised
    to the minimum);
  - `cap with gains`: `qbi 50,000, taxable 60,000, netGain 30,000` -> **6,000**;
  - `minimum`: `qbi 1,500, taxable 50,000` -> **400**; `qbi 900, taxable 50,000` -> **180**;
  - `joint`: `qbi 100,000, taxable 478,500` (403,500 + 75,000) -> **5,000**;
  - `two returns`: a `taxFor` profile literal with `filing: 'single'`, `singlePerson: false` (two filers), `sePlanNetA
    40,000, seNetA 40,000, otherA 40,000, sePlanNetB 60,000, seNetB 60,000, otherB 60,000` in `tx`: equals the sum of the two
    single-return taxes worked by hand with QBI on each return (A: taxable 23,900, QBI 4,780; B: taxable 43,900, QBI 8,780;
    recompute from `STD_DEDUCTION` / `ORDINARY_BRACKETS` and show it in a comment), not one joint QBI;
  - `lagged pass`: the same single profile in `or` (Oregon deducts federal tax through the lagged pass; check its row's
    `federalTaxSubtraction.kind === 'lagged'`): `taxFor` with QBI is lower than with `sePlanNetA: 0` by less than the
    federal QBI effect alone (the state's federal-tax subtraction shrinks as federal tax falls, so the state tax rises a
    little): assert the difference lies between zero (exclusive) and the federal effect (inclusive: equal when Oregon's
    subtraction cap or phase-out already binds), and print both;
  - `indexing`: `state.inflation = 10`, year index 1 (check `taxIndexFactor(1)` is 1.1 with the hook `__test_tax.taxIndexFactor`;
    if it differs, use its value `f` in place of 1.1): threshold `201,750 f`, width 75,000: `taxable = 201,750 f + 37,500`
    -> 5,000 for `qbi 100,000`; the minimum is `400 f` (with `qbi 3,000` there: `400 f`).
  `taxFor` (`tx`, profile literal, single, `seNetA 50,000, sePlanNetA 50,000, otherA 50,000`, no wages): equals the same profile's tax
  without `seNetA` minus the QBI's tax effect worked by hand: taxable before QBI `50,000 - 16,100 = 33,900` (check the 2026
  single standard deduction `16,100` in `STD_DEDUCTION`), QBI `min(10,000, 6,780) = 6,780`, ordinary tax on 27,120 against
  33,900 at 2026 brackets (10% to 12,400, 12% above: 1,240 + 12% x (27,120 - 12,400) = 3,006.40 against 1,240 + 12% x
  21,500 = 3,820): **difference 813.60** (check the 2026 bracket edges in `ORDINARY_BRACKETS` and recompute if they
  differ, showing the arithmetic in a comment).
  Engine: the Task 3 single self-employed household (`tx`, no children, and `taxable: 0, cash: 0` so there is no
  qualified dividend: the gains term of the cap is then truly 0): with `p = trace[0].profile`,
  `__test_tax.taxFor(p, 0, 0) - __test_tax.taxFor({ ...p, sePlanNetA: 0 }, 0, 0)` (removes QBI only) equals `-(ordinaryTax(o, 0, 'single', d) -
  ordinaryTax(o, 0, 'single', d + q))` with `o` the profile's ordinary income, `d` the standard deduction and
  `q = qbiDeduction(p.sePlanNetA - p.seHealthA, o - d, 0, false, 0)` (worked in the test from the hooks); an all-W-2 household is identical (`JSON.stringify(rows)` with and without
  the new keys).
  End with `console.log('qbi: all passed')`.
- [ ] **Step 2: Run it; it fails** (`__test_qbiDeduction is not a function`).
- [ ] **Step 3: `qbiDeduction`** just above `taxFor`:
```js
  // E1c: the qualified business income deduction (IRC 199A), federal only, below AGI. 2026 limits from Rev. Proc. 2025-32
  // section 4.26 (threshold indexed; the phase-in width is a fixed statutory amount since OBBBA section 70105). Every
  // business is treated as a specified service business with no W-2 wages and no property (owner decision): full 20%
  // up to the threshold, 20% x ap^2 inside the range, nothing above; capped at 20% of taxable income less net capital
  // gain (which includes qualified dividends). The $400 minimum (IRC 199A(i)) applies after the cap, to a taxpayer with
  // $1,000 of QBI from qualified businesses: an SSTB counts only at the applicable percentage, and not at all above the
  // range (199A(d)(1)(A), (d)(3)).
  const QBI_LIMITS = { threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum: 400, minimumQbi: 1000 };
  function qbiDeduction(qbi, taxable, netGain, joint, yearIndex) {
    if (!(qbi > 0)) return 0;
    const f = taxIndexFactor(yearIndex),
      threshold = (joint ? QBI_LIMITS.threshold.joint : QBI_LIMITS.threshold.other) * f,
      width = joint ? QBI_LIMITS.width.joint : QBI_LIMITS.width.other,
      ap = Math.min(1, Math.max(0, 1 - (taxable - threshold) / width)),
      d = Math.min(0.2 * qbi * ap * ap, 0.2 * Math.max(0, taxable - netGain));
    return ap * qbi >= QBI_LIMITS.minimumQbi * f ? Math.max(d, QBI_LIMITS.minimum * f) : d;
  }
```
- [ ] **Step 4: `taxFor`.** At the top, with the other self-employment reads: `sePlanNetA = profile.sePlanNetA || 0,
  sePlanNetB = profile.sePlanNetB || 0,`. Joint branch, after `deduction` is computed:
```js
      const qbi = sePlanNetA + sePlanNetB > 0
        ? qbiDeduction(sePlanNetA - seHA + (sePlanNetB - seHB), Math.max(0, ordinary + gains - deduction), gains, true, profile.year)
        : 0;
```
  and pass `deduction + qbi` (not `deduction`) to `ordinaryTax` and `longTermGainTax` (`d + 0` is `d`). Single branch: the
  same with `sePlanNetA - seHA` and `joint = false`. Two-filer branch: `qbiA` from `sePlanNetA - seHA` against `ordinaryA + gainA -
  deductionA`, `qbiB` likewise, both `joint = false`; use `deductionA + qbiA` in every `ordinaryTax` / `longTermGainTax`
  call for A (including `federalA` for the credits) and `deductionB + qbiB` for B. Lagged pass:
  `federalLiabilityForState(..., medical = 0, qbiBase = 0)` computes, when `qbiBase > 0`,
  `q = qbiDeduction(qbiBase, Math.max(0, ordinary + gains - deduction), gains, filingRow(status).joint, year)` and uses
  `deduction + q` in its two tax calls; pass `sePlanNetA + sePlanNetB - seHA - seHB` (joint), `sePlanNetA - seHA` (single,
  A of two filers), `sePlanNetB - seHB` (B) as the new last argument at each call site (0 when there is no
  self-employment, so the lagged pass is unchanged for everyone else).
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
    ['R single self-employed cliff band', { ...R, singlePerson: true, retireAgeA: 60, incomeA: 82000, incomeKindA: 'self', acaEnabled: true }],
```
  `npm run snapshot:update`; `git diff tests/snapshots/us.json` shows exactly these eight added entries and their
  historical runs, no changed line; the UI snapshot must not change (if `snapshot_ui.js --update` rewrote `ui_us.json`
  with only the timing-flaky `histSuccess` text, restore it).
- [ ] **Step 8: `test_self_employment.js` part 2:** clicking `#incomeKindASelfBtn` on a working partner changes
  `window.fireProjectionRows[0].tax` and RAISES `fireProjectionRows[0].wages` by the health premium no longer paid when a
  per-paycheck premium was set (a self-employed partner has no payroll-deducted premium; their coverage is priced in
  `healthcare` instead); a `self` stream with `#incSrc0Contribute` and `#incSrc0ProfitSharingPct` 25 raises the next
  row's `traditional`. Run it.
- [ ] **Step 9: Badge** US `V124` -> `V125`. `npm test` green.
- [ ] **Step 10: Timing** (Global Constraints), both tables. Plus, recorded only: in a scratch script (not committed),
  31 interleaved rounds of 400 `__test_simulateRaw()` on `R side business stream`'s state against the same state with the
  stream's `kind: 'wages'`, both on the working tree; report the two medians.
- [ ] **Step 11: Commit.**
```bash
git commit -m "E1c 6: qualified business income deduction (specified service, no employees; 2026 Rev. Proc. 2025-32 limits, the \$400 minimum as the law gives it to a specified service business); eight new scenarios (new entries only); US V125" -- Planner_US.html tests/qbi.js package.json tests/snapshot_scenarios.js tests/snapshots/us.json test_self_employment.js
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
  legacy proof, the list of MAGI-iteration sites changed, the snapshot notes (eight entries added, no existing entry
  changed), timing tables per measured task and the side-business timing, and "For the owner" items. Record there the
  deviations the plan made from the spec's first draft: coverage built as `employerA/B` + `streamCoverBits` (no
  `coverageOf`), no `scalarSnapshot` entry (`prevSeHealthA/B` is written only after convergence), the 162(l) band rule
  (decision 8b) with the band test's outcome, the Roth fill seeing 162(l) but not QBI (8c), and the row's `income`
  staying before the 162(l) deduction.

- [ ] **Step 1:** Write the three edits (text to a file, then insert with a node script; keep CRLF).
- [ ] **Step 2:** `npm test` green (docs only).
- [ ] **Step 3: Commit.**
```bash
git commit -m "E1c 7: README, CLAUDE.md and implementation notes (docs only)" -- README.md CLAUDE.md docs/next-batches-plan.md
```

Report to the owner: the branch tip, each commit's hash and one-line summary, the red runs, the legacy proof, the
MAGI-iteration sites changed, the timing tables for Tasks 2, 5 and 6 and the side-business timing, and anything that did
not go as planned.

---

### Task 8: Review fixes (owner decisions A and B, 2026-10-09; spec decision 9)

Two reviews of the branch tip `5fef95b` (the spec owner's and an independent Opus review; `docs/next-batches-plan.md`,
"E1c: review, part 1" and the E1c review record) found: the 162(l) band charges a subsidized premium at a MAGI above the
400% line (decision 8b's rule; illegal under Rev. Proc. 2014-41), the timing gate fails for every household, stale copy,
and three tests that pass when wrong. Three commits, in this order. Line numbers are at `5fef95b`.

**Global rules for this task:** every entry of `tests/snapshots/us.json` / `canada.json` that existed at `ee7a789` stays
byte-identical in every commit (prove it with a dump of `../fp-e1c-base` against the working tree, using the working
tree's scenario list: only E1c's eight new scenario files may differ from the base). Commit 8a changes no number at all
(`node tests/snapshot.js` passes against the committed baseline). Commit 8b may change only E1c's new entries, each one
listed with the reason in the report. Badge stays V125 (unreleased).

#### Commit 8a: speed (decision B; no number change)

- [ ] **Step 1: The flag.** `buildTaxProfile` sets `seOn: seA > 0 || seB > 0` in both profile literals (the A-deceased
  remap too). `LAMBDA_PROFILE` (~line 9372) gains `seOn: false`; grep every other object literal or factory that reaches
  `taxFor` (`taxFor(` callers, the Roth solver and optimizer profile literals, `newTestWithdrawal`-style test hooks) and
  give each `seOn: false`. Test profile literals in `tests/self_employment.js`, `tests/qbi.js`, `tests/se_health.js` and
  `tests/income_streams.js` that carry self-employment keys gain `seOn: true`.
- [ ] **Step 2: `taxFor` reads the self-employment fields only when `profile.seOn` is true.** Today's top-of-function
  block reads ten `profile.x || 0` fields on every call. Replace it by declarations that are 0 unless the flag is set,
  e.g. `const seOn = profile.seOn === true, seNetA = seOn ? profile.seNetA : 0, ...` (or one `if (seOn) { ... }`
  assigning `let`s, or a nested `profile.se` object: pick the form that measures fastest). Every expression that uses
  them stays exactly as it is (they are exact zeros for everyone else), so no number changes.
- [ ] **Step 3: Other per-call additions.** List every E1c addition that runs per `taxFor` call or per MAGI pass for a
  household with no self-employment (site 4's three assignments, `costAt`'s default parameters, `healthcareCost`'s
  `premA/premB`, the `estUsed` test at site 7, the convergence term) and keep each only if it is not measurable; skip
  work behind `seOn` / `twoReturns` where it is. No change may alter a number.
- [ ] **Step 4: Gate.** `node tests/snapshot.js` passes against the committed baseline. Then
  `node tests/bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21` (+5% per path) and
  `node tests/bench_solver.js --base ../fp-e1c-base --rounds 31` (recorded). If any path is still over +5%, bisect:
  run the interleaved bench of each E1c commit against its parent (`c74e439`, `6e2f36a`, `88ab2a4`, `de7fc94`, `06ed7fd`,
  `0f274db`, and this commit's tree, each as a temporary detached worktree), report the per-commit table, and stop for
  the owner's decision rather than trying unplanned changes.
- [ ] **Step 5: Commit** `E1c 8a: self-employment fields read in taxFor only when the profile has self-employment (seOn); no number change` with
  `Planner_US.html` and the test files touched.

#### Commit 8b: the 162(l) band uses Rev. Proc. 2014-41's alternative calculation (decision A)

- [ ] **Step 1: Tests first** (`tests/se_health.js`; run red at `5fef95b` + 8a and record the output). Single,
  self-employed, `tx`, `acaEnabled: true`, `healthcare: 18000`, the fixed-point household otherwise (`inflation: 0`,
  `incomeGrowth: 0`, no balances that pay income):
  - `band, consistent premium`: for profits 70,000, 74,000, 82,000 and 86,000, year 0:
    `|rows[0].healthcare - __test_tax.acaNetCost(rows[0].magiProxy, 1, 18000, 0)| <= 2` (fails today at 74,000-86,000
    by about 12,000);
  - `band, the alternative calculation by hand` (82,000; sePlanNet 76,206.8845): step 1 deduction 18,000, MAGI
    58,206.88; steps 2-3 deduction = `acaNetCost(58206.8845, 1, 18000, 0)` (about 5,797.41); step 4: MAGI
    `76,206.8845 - D` (about 70,409.5), premium 18,000. Assert `trace[0].profile.seHealthA` equals that `D` within 1e-6,
    `rows[0].magiProxy` within 1, `rows[0].healthcare === 18000`;
  - `joint band`: married couple, both 50, A self-employed, B retired with no pay, `filingStatus: 'mfj'`, premium
    18,000: choose A's profit so that sePlanNet is 98,000 (solve with `__test_selfEmploymentTax`, report the profit): the
    same consistency assertion with household size 2;
  - `Medicaid line` (`stateTax: 'ca'`, an expansion state): single, profit chosen so that sePlanNet sits $300 above the
    Medicaid line for one person (1.38 x the 2026 poverty line the engine uses; read it with the existing FPL hook or
    `acaNetCost` probing, and report it): consistency `|H - acaNetCost(M, 1, 18000, 0)| <= 2`;
  - `converged years unchanged`: the fixed-point household (profit 60,000) keeps the Task 5 values (`D` and `M` as that
    test computes them), and `magiStats.forced` does not grow for it.
- [ ] **Step 2: The code.** Year loop (all edits guarded by the 162(l) allow flags, so no other household is touched):
  1. Next to `let forcedPass = false;` (~line 10555) add
     `let seHeld = false; // E1c decision A: the alternative calculation's deduction, held for the rest of the phase`.
  2. Site 7 (~line 10775): `if (profile.seAllowA || profile.seAllowB) {` becomes
     `if (seHeld) { seRealA = estSeA; seRealB = estSeB; } else if (profile.seAllowA || profile.seAllowB) {` (the held
     pair is the realized pair, so the deduction term of the convergence test is 0).
  3. Insert this block between the damped-continue block (`if (unconverged && !forcedPass && !replaying && phasePass <
     MAGI_ITER_MAX - 1) {` ~line 10903) and the forced-pass block (`if (unconverged && !forcedPass && !replaying &&
     usesMagiEstimate) {` ~line 10913):
```js
        if (unconverged && !forcedPass && !replaying && !seHeld && (profile.seAllowA || profile.seAllowB)) {
          // E1c decision A (Rev. Proc. 2014-41 section 5.02): the iterative calculation did not converge, so the year uses
          // the alternative calculation. Step 1: the deduction at the full premiums (priced at a MAGI above every line);
          // steps 2-3: the deduction at the premium after the credit the step-1 MAGI allows; step 4: this pass re-run with
          // that deduction held, so the premium, the draws and the MAGI follow it. The draws are this pass's.
          costAt(traditionalGross, taxableGainGross, -1e12, -1e12);
          seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
          const d1A = SE_HEALTH[0], d1B = SE_HEALTH[1];
          costAt(traditionalGross, taxableGainGross, d1A, d1B);
          seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
          estSeA = SE_HEALTH[0];
          estSeB = SE_HEALTH[1];
          estTrad = realizedTrad;
          estGain = taxableGainGross;
          seHeld = true;
          passLog.length = 0;
          phasePass = -1;
          continue;
        }
```
     Check first that `healthcareCost` at a MAGI of about 2e12 returns the full premiums (no credit, no Medicaid; with
     `acaEnhanced` on too) and is finite; if not, use the gross premium another way and say how.
  4. Site 12 (the forced pass, ~line 10941): `if (profile.seAllowA || profile.seAllowB) {` becomes
     `if (!seHeld && (profile.seAllowA || profile.seAllowB)) {` (a held deduction does not follow the premium).
  5. Carry `seHeld` with the phase: add `seHeld` to both `naturalRec = { ... }` literals and the `trialRecs.push({ ... })`
     entry; set `seHeld = naturalRec.seHeld` at the apply fallback replay (with `estSeA = naturalRec.estSeA`, ~line 11032)
     and `seHeld = best.seHeld` at the winner replay (~line 11062); set `seHeld = false` at the trial start (with
     `forcedPass = false`, ~line 11079). The pick restore (forced pass) keeps `seHeld` as it is.
  6. Update the comment on the forced pass (`The cash can only rise` stays true there: a held deduction is not
     re-priced) and the iteration comment block (sites 3/7) to describe the switch.
- [ ] **Step 3: Run.** The Step 1 tests pass; `node tests/se_health.js`, `node tests/cliff_plan.js`,
  `node tests/aca_magi_iteration.js`, `node tests/aca_medicaid.js`, `node tests/two_return_magi.js` pass.
  `node tests/snapshot.js` fails only on E1c's new entries. Dump against the 8a commit and against `../fp-e1c-base`:
  list every E1c scenario that moved (expected: `R single self-employed cliff band`; any other must have a forced year
  in the band or at the Medicaid line: say which year), with first differing year, `healthcare`, `magiProxy` before ->
  after, and depletion before -> after. No pre-E1c entry may differ. Then `npm run snapshot:update` and confirm the json
  diff touches only those E1c entries.
- [ ] **Step 4: Timing:** `bench_runs_interleaved` (21) and `bench_solver` (31) against `../fp-e1c-base`, tables in
  the report (the change is behind the allow flags, so no-self-employment households should not move).
- [ ] **Step 5: Commit** `E1c 8b: in a year whose 162(l) iteration does not converge, Rev. Proc. 2014-41's alternative calculation (deduction held, premium and draws follow it); snapshot:update for E1c's new entries only` with `Planner_US.html`, `tests/se_health.js`, `tests/snapshots/us.json`.

#### Commit 8c: copy, the remaining tests, docs

- [ ] **Step 1: Copy** (`Planner_US.html`; HTML-escape apostrophes as `&#x27;`):
  - `#healthcare` tooltip and `<small>` (~line 505): "once retired and under 65" -> "while without employer coverage
    (retired, or self-employed) and under 65";
  - `#acaEnabled` tooltip (~line 506): "while retired and under 65" -> "while without employer coverage (retired, or
    self-employed) and under 65";
  - `#medicareYearly` tooltip (~line 507) and the "Healthcare, ACA, Medicare & IRMAA" callout (~line 713): Medicare
    starts "at 65 for a partner without employer coverage, or when a partner who keeps working for an employer past 65
    stops (a self-employed partner enrolls at 65)"; the callout's "while they are retired and under 65" as for
    `#healthcare`;
  - the employer-plan boxes' `<small>` (~lines 416-417): "B buys ACA coverage once B retires" -> "Otherwise B buys
    marketplace coverage while without employer coverage" (A's box mirrored);
  - the catch-up tooltips (~lines 368, 373): append " Not for a self-employed partner's Solo 401(k): self-employment
    has no FICA wages, so its catch-up follows the 401(k) type.";
  - the profit-sharing field `<small>` for A and B: "Employer contribution, % of pay" (or the current text) -> "Employer
    contribution, or your Solo 401(k) plan rate, % of pay".
- [ ] **Step 2: Tests** (each new assertion run red where it can be):
  - `tests/se_health.js`: rename `ACA off still converges` to say what it checks (the recorded MAGI follows the realized
    deduction); make the Roth-fill test's header say it is the guard for site 7's `estUsed` line, and prove it: run it with
    that line removed in a scratch copy, record the red output in the report;
  - `tests/self_employment.js` "Solo money leaves cash" (~line 208): replace `bal(s1) < bal(s0) - 1000` by the hand
    difference: cash + taxable lower by `(24,500 + 18,587.045) - (tax without - tax with)`, the two taxes from
    `__test_tax.taxFor` on each run's `trace[0].profile` (with `seOn` set), within 1e-6;
  - `tests/qbi.js` engine case (~lines 84-97): a comment saying the hand-computed pure cases pin `qbiDeduction` and this
    case checks the wiring.
- [ ] **Step 3: Docs:** `CLAUDE.md` (the alternative-calculation switch and `seHeld`; the `seOn` flag and that every
  profile reaching `taxFor` carries it) and an `E1c: review fixes (Task 8)` paragraph in the E1c implementation block of
  `docs/next-batches-plan.md` (commits, red runs, the moved E1c entries table, timing tables).
- [ ] **Step 4:** `npm test` green; `snapshot_ui.js --update` only if the copy changed the US DOM hashes (say so);
  `ui_canada.json` untouched.
- [ ] **Step 5: Commit** `E1c 8c: coverage copy for the self-employed, test fixes, docs` with the touched paths.

Report: the three commits, the red runs, the moved E1c entries table, both timing tables for 8a and 8b (and the
per-commit bisect if 8a's gate failed), and anything that did not go as planned.

### Task 9: Review fixes, round 2 (owner decision, 2026-10-09; spec decision 10)

The spec owner's review of `5399f23` (`docs/next-batches-plan.md`, "E1c: review, part 3") found that Task 8b's switch fires on
**any** unconverged year with a 162(l) deduction allowed, but the engine's damped 8-pass iteration also fails where a consistent
answer exists: it zigzags across the 400% line. Measured (single, `tx`, $18,000 premium, the fixed-point household of
`tests/se_health.js`, year 0):

| Profit | Engine at `5399f23`: D / premium | Consistent answer: D = premium |
|---|---|---|
| 67,500-72,500 | alternative calculation, premium $118-141 too high | 5,682-6,103 |
| 72,750-74,000 | D 4,941-5,057, **premium 18,000** | 6,124-6,229 (about $11,800 a year lower) |
| 74,250 and up (to the top of the band) | alternative calculation | none: the alternative calculation is right |

Joint (`mfj`, A self-employed, B no pay): 91,500-98,500 about $100 too high; 99,000-100,000 premium 18,000 against a consistent
8,334-8,418. The consistent answer is legal: Rev. Proc. 2014-41 section 5.01 lets a taxpayer whose iteration never comes within
$1 use the alternative calculation "or another method that produces amounts that satisfy applicable tax law", and the fixed point
(deduction = the premium after the credit at the MAGI it gives, within the cap) is such an amount; where the iteration does
converge, it is the same answer. The timing gate also still fails (spec owner's two runs of `bench_runs_interleaved` 21 rounds:
tx simulate +2.1 / +8.0, tx historical +3.6 / +7.1, ca historical +2.5 / +6.3, ny historical +5.8 / +2.3, pa historical +5.2 / +1.3,
wa historical +6.3 / +3.1; the implementer's three 8b runs put tx simulate at 8.6 / 6.3 / 7.6), and the snapshot grid never reaches
the band (`R single self-employed cliff band` sits at MAGI about 83,710).

Three commits, in this order. Line numbers are at `5399f23`. **Global rules:** every entry of `tests/snapshots/us.json` /
`canada.json` that existed at `ee7a789` stays byte-identical in every commit (prove it with a dump of `../fp-e1c-base` against the
working tree, the working tree's scenario list). 9a may change only E1c's entries (list each with its reason); 9b only adds
entries; 9c changes no number at all (`node tests/snapshot.js` passes against the committed baseline). Badge stays V125.

#### Commit 9a: find the consistent deduction before the alternative calculation (decision 10)

- [ ] **Step 1: Tests first** (`tests/se_health.js`, Task 8b's section; run red at `5399f23`, record the output). For each case
  compute the consistent deduction by hand in the test with a bisection on `__test_tax.acaNetCost` (as the spec owner's probe did:
  `g(D) = min(cap, acaNetCost(sePlanNet - D, n, premium, 0)) - D`, decreasing; 80 halvings on `[0, min(cap, premium)]`; it exists when
  `|g| < 1` at the end):
  - `sliver, single` (the fixed-point household, profits 70,000 and 73,000): `|trace[0].profile.seHealthA - Dfp| <= 1`,
    `|rows[0].healthcare - acaNetCost(rows[0].magiProxy, 1, 18000, 0)| <= 2`, and at 73,000 `rows[0].healthcare < 7000` (today 18,000).
    Expected: 70,000 D about 5,892.55; 73,000 D about 6,145.08.
  - `sliver, joint` (the Task 8 joint band household with A's profit 99,000): the same with household size 2 (expected D about
    8,334).
  - `sliver, two returns`: an unmarried couple (`filingStatus: 'single'`, both 50, A self-employed, B retired with no pay, no
    children, premium 18,000 so A's part is 9,000 on a one-person line). Scan A's profit in 500 steps at `5399f23` for a year-0
    case where the year switched (A's deduction is not within $1 of A's consistent one) and a consistent one exists; report the
    profit; assert `|seHealthA - Dfp(A)| <= 1` with A's part priced on `rows[0].magiA`.
  - The Task 8b cases keep passing unchanged: 82,000 and 86,000 (no consistent answer: the alternative calculation's by-hand
    values), the joint band at sePlanNet 98,000 (check whether a consistent answer exists there and report it: if it does, the
    test's expected values change with this commit; say so), the Medicaid line case and `converged years unchanged`.
- [ ] **Step 2: The code.** In the 8b block (`if (unconverged && !forcedPass && !replaying && !seHeld && (profile.seAllowA ||
  profile.seAllowB)) {`, ~line 10926), before the alternative calculation, search for the consistent deduction holding this pass's
  draws (`traditionalGross`, `taxableGainGross`), and hold it if found; else the alternative calculation as today. Sketch:
```js
          // Step 1 of either method: the deduction at the full premiums.
          costAt(traditionalGross, taxableGainGross, -1e12, -1e12);
          seHealthDeduction(lastCost.healthcare, lastCost.premA, lastCost.premB, twoReturns, profile, SE_HEALTH);
          const d1A = SE_HEALTH[0], d1B = SE_HEALTH[1];
          // E1c decision 10: the consistent deduction (D = the deduction the premium at D's MAGI allows), if there is one: the
          // iteration's own answer where it converges, and an amount that satisfies the law (Rev. Proc. 2014-41 section 5.01's
          // last sentence). The deduction the premium allows falls as D rises (D lowers the MAGI), so g(D) = allowed(D) - D is
          // decreasing and a bisection on [0, step-1 deduction] finds the one crossing; it is consistent when |g| < 1 there.
          // One return: one search on the total (seHealthDeduction splits it, A first). Two returns: one search per return
          // (each return's premium reads only its own MAGI); a return with no consistent answer takes the alternative value.
          ... seFixedPoint(...) -> estSeA / estSeB, or the alternative calculation for the part that has none ...
          estTrad = realizedTrad;
          estGain = taxableGainGross;
          seHeld = true;
          passLog.length = 0;
          phasePass = -1;
          continue;
```
  Requirements:
  1. One return (`!twoReturns`): bisect the total `T` on `[0, d1A + d1B]`; for a probe `T`, `sa = min(T, capA)`, `sb = T - sa`
     (the split `seHealthDeduction` uses; `capX = profile.seAllowX ? profile.sePlanNetX : 0`), `allowed = total of
     seHealthDeduction(costAt(trad, gain, sa, sb), lastCost.premA, lastCost.premB, ...)`. Two returns: bisect `sa` on `[0, d1A]`
     with `sb = d1B`, then `sb` on `[0, d1B]` with `sa` at its result, each `allowed` read from its own slot. Check that a return's
     slot of `seHealthDeduction` depends only on its own MAGI (premA on `magiA`, premB on `magiB`); if it does not, stop and report.
  2. Stop the bisection when the bracket is narrower than $0.01 (or at 60 halvings). Consistent when `allowed(lo) - lo <= 1`
     (`lo` is the bracket's left end, where `g >= 0`); hold `lo`. Otherwise the alternative calculation for that sum / return
     (steps 2-3 of section 5.02 exactly as 8b does today: `costAt` at the step-1 pair, `seHealthDeduction`).
  3. Allocation-free (scalars only; a small helper function at module level or a closure defined once per run, not per pass;
     `costAt` and `SE_HEALTH` as today). `costAt` restores `hcArgs` itself; leave `lastCost` as the last call left it (nothing
     after the block reads it before the `continue`).
  4. Where `g` is not monotone (below 100% of the poverty line in a non-expansion state the premium rises as MAGI falls; the
     `medicaidWhenEligible` box off), the bisection may miss a consistent answer and the year takes the alternative calculation:
     legal either way. Say so in the comment.
  5. Count it: `magiStats.seFixed` (a consistent deduction held) and `magiStats.seAlternative` (the alternative calculation used),
     next to the existing counters (cumulative, like them).
  6. Update the iteration comment (~line 10541), the 8b comment and the forced-pass comment wording if they name the alternative
     calculation alone.
- [ ] **Step 3: Run.** Step 1 tests pass; `node tests/se_health.js`, `node tests/cliff_plan.js`, `node tests/aca_magi_iteration.js`,
  `node tests/aca_medicaid.js`, `node tests/two_return_magi.js` pass. Re-run the spec owner's scan and report the table: single
  profits 66,000-76,000 by 250 and joint 90,000-101,000 by 500, year 0: engine D / premium against the consistent D (expected: every
  profit with a consistent answer now within $1; the rest unchanged from `5399f23`). Also: with inflation 3, income growth 3, medical
  inflation 5, single profits 30,000-110,000 by 1,000, years 0-9: the largest `|healthcare - acaNetCost(magiProxy, 1, gross premium of
  that year, y)|` (gross premium from the same run with `acaEnabled: false`); must stay <= 2. Then `node tests/snapshot.js`: list
  every E1c entry that moved (expected: possibly `R side business stream`, whose 3 switched years now hold the consistent
  deduction; any other: say which year and why) with the first differing year, `healthcare`, `magiProxy` before -> after and
  depletion before -> after; then `npm run snapshot:update` and confirm the json diff touches only those entries.
- [ ] **Step 4: Commit** `E1c 9a: in a year whose 162(l) iteration does not converge, hold the consistent deduction when one exists (bisection), else Rev. Proc. 2014-41's alternative calculation` with `Planner_US.html`, `tests/se_health.js` and `tests/snapshots/us.json` if it changed.

#### Commit 9b: snapshot scenarios that reach the band (new entries only)

- [ ] **Step 1:** In `tests/snapshot_scenarios.js`, beside the E1c scenarios, add two US scenarios on a household with no
  income-paying balances (cash and taxable 0, `hysaRate: 0`; traditional and Roth balances are fine, they pay no income until
  drawn), single, age 50, retiring at 60, self-employed main income, `acaEnabled: true`, `healthcare: 18000`, `stateTax: 'tx'`,
  default inflation and growth: `single self-employed band, alternative` (profit 82,000) and `single self-employed band, consistent`
  (profit 73,000). Before adding them, run each at the tip and confirm year 0 is a switched year of the intended kind (read
  `magiStats.seAlternative` / `seFixed` around one `__test_simulate()`); if default inflation moves a case out of its kind, adjust
  the profit and report it.
- [ ] **Step 2:** `npm run snapshot:update`; confirm the json diff only adds the two entries (and a dump of `../fp-e1c-base` shows
  only E1c's scenario files differ: now ten).
- [ ] **Step 3: Commit** `E1c 9b: two snapshot scenarios inside the 162(l) band (new entries only)` with the scenario file and `tests/snapshots/us.json`.

#### Commit 9c: timing (decision B, continued; no number change)

- [ ] **Step 1: Measure first.** The per-commit bisect that Task 8a step 4 required: for each E1c code commit against its parent
  (`c74e439`, `6e2f36a`, `88ab2a4`, `de7fc94`, `06ed7fd`, `0f274db`, `ebda26d`, `f3884fd`, and 9a), make two temporary detached
  worktrees (with `node_modules` linked as a directory junction from `../fp-e1b`) and run
  `node <commit tree>/tests/bench_runs_interleaved.js --base <parent tree> --rounds 21` (the script times its own tree against
  `--base`). Report the table (each commit, each state, simulate / historical). Remove the
  temporary worktrees afterwards (only those you made).
- [ ] **Step 2: Task 8a step 3, done now.** Move behind `profile.seOn` (or the `seAllowA || seAllowB` / `twoReturns` flags where they
  fit) every E1c addition that runs per `taxFor` call or per MAGI pass for a household with no self-employment, starting with the
  commits Step 1 shows cost the most. Known candidates: site 4's three assignments, `costAt`'s default parameters and its
  `profile.seHealthA/B` save and restore, `healthcareCost`'s `premA` / `premB` (computed for every household), the `estUsed` test
  at site 7, the deduction term of the convergence test, `realizedMagi`'s deduction term, `streamAmountsForYear`'s `selfA/B` and
  premium fields, and the `buildTaxProfile` self-employment block (`selfEmploymentTax`, `soloPlanContributions`, `qbiDeduction`
  calls made with zeros). Every change keeps each number exactly (`node tests/snapshot.js` passes against the committed baseline,
  `node tests/tax_caches.js` passes).
- [ ] **Step 3: Gate.** `node tests/bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21` **three times**; the gate passes
  when every path's median over the three runs is within +5%. `node tests/bench_solver.js --base ../fp-e1c-base --rounds 31` twice
  (recorded). If the gate still fails, stop and report Step 1's table and the three runs for the owner's decision; do not try
  unplanned changes.
- [ ] **Step 4: Docs** (in this commit): `CLAUDE.md` (decision 10: the consistent-deduction search and the counters; the 9c rule
  that the self-employment work is skipped for a household without it), and an `E1c: review fixes, round 2 (Task 9)` paragraph after
  the Task 8 paragraph in `docs/next-batches-plan.md` (commits, red runs, the scans, the moved entries table, the bisect table, the
  timing runs).
- [ ] **Step 5:** `npm test` green. **Commit** `E1c 9c: self-employment work skipped for households without it (timing); no number change; docs` with the touched paths.

Report: the three commits, the red runs, the scan tables, the moved E1c entries table, the two new scenarios (profits, kinds), the
per-commit bisect table, the timing runs, and anything that did not go as planned.

### Task 10: Review fixes, round 3 (owner decisions, 2026-10-09; spec decision 11)

Two reviews of `9b47b3a` (the spec owner's and an independent Opus review; `docs/next-batches-plan.md`, "E1c: review, part 4")
accepted Task 9 and found: (1) the held deduction is computed on the draws of the pass that failed to converge; after the hold
the year re-runs, the draws respond to the new premium, and the year can end with a deduction that is neither the consistent
one nor section 5.02's for its final income (always an understatement; the reviewer's example: single, 60, a $30,000 self
stream, spending $24,000, taxable with 30% basis, `tx`, $18,000 premium, year 0: held 6,224.54, premium 18,000, MAGI 74,561,
where both methods give 18,000 at the final draws; 26 of 6,160 band years with draws); (2) the switch also fires when the
step-1 deduction is 0 (`R side business stream`: the Solo plan uses the whole net), holding $0 and restarting the passes, and
`magiStats.seFixed` / `seAlternative` count every phase of a phased cliff-plan year, not only the kept one; (3) no test of the
A-first split in a held joint year with both partners self-employed; (4) docs. Two commits, in this order. Line numbers are at
`9b47b3a`.

**Global rules:** as Task 9: every entry that existed at `ee7a789` stays byte-identical in every commit (dump of `../fp-e1c-base`
against the tree, the tree's scenario list: only E1c's ten scenario files may differ). 10a may change only E1c's entries (each
listed with its reason). 10b changes no number. Badge stays V125. No other change.

#### Commit 10a: the re-check, the $0 guard, kept-phase counters

- [ ] **Step 1: Tests first** (`tests/se_health.js`, after the Task 9a section; run red at `9b47b3a`, record the output; the test
  file stops at the first failure, so run each new case alone once to record its red output).
  - `held year re-checked at its final draws`: reproduce the reviewer's household above (`incomeSources` with one `kind: 'self'`
    stream owned by A, `contribute: false`; the main income 0; check the taxable-basis field's real name in `defaults`). If year 0
    does not show the gap at `9b47b3a`, scan spending 20,000-40,000 by 2,000 and stream amount 20,000-40,000 by 2,000 for a year
    where `|D - S|` > 1, with `S` = the search at the final draws (below), and report the household used. Assert at the tip:
    `|D - S| <= 1`, where `S` is computed in the test from the year's own row and profile: `base = magiProxy + seHealthA`,
    `cap = sePlanNetA`, `g(d) = min(cap, acaNetCost(base - d, 1, premium, y)) - d`; `S` = the consistent `d` (bisection as `dfp`
    does) if `|g| < 1` there, else section 5.02 at those draws: `min(cap, acaNetCost(base - min(cap, premium), 1, premium, y))`.
  - `held years over a draw grid`: single, 55, retiring at 55, a self stream of 20,000-60,000 by 5,000, spending 30,000 and 60,000,
    taxable 500,000 at 30% basis, `tx`, premium 18,000, inflation 0, years 0-9: every year with `seHealthA > 0` and
    `|seHealthA - min(sePlanNetA, healthcare)| > 1` (a held alternative year) satisfies `|D - S| <= 1`, OR is a year whose re-check
    already ran (count those: the bound allows one re-hold; report how many years end more than $1 off after it, expected 0 or
    near it). Report the counts at `9b47b3a` and at the tip.
  - `no hold at a $0 deduction`: `R side business stream`'s household (copy its patch from `tests/snapshot_scenarios.js`): its
    `seFixed + seAlternative` delta over one `__test_simulate()` is 0 at the tip (today 3 or more), and its rows are byte-identical to
    `9b47b3a`'s (pin a JSON hash of the rows taken at `9b47b3a`).
  - `held joint split, both self-employed`: married, both 50, both self-employed, `capA` small enough to bind (choose A's profit so
    that `sePlanNetA` is about 3,000), B's profit in the joint sliver (scan for a year-0 `seFixed` hold); assert
    `seHealthA === min(total, sePlanNetA)` exactly and `seHealthB === total - seHealthA` (A first).
- [ ] **Step 2: The code.**
  1. **Kind of hold, counted for the kept phase.** Next to `let seHeld = false;` add `let seKind = 0; // 1: the consistent
     deduction held, 2: the alternative calculation's`. In the 9a block replace `magiStats.seAlternative++` /
     `magiStats.seFixed++` by `seKind = needAlt ? 2 : 1`. Carry `seKind` everywhere `seHeld` is carried (both `naturalRec` literals,
     `trialRecs.push`, the fallback replay, the winner replay; `seKind = 0` at the trial start). Next to
     `if (phaseUnresolved) magiStats.unresolved++;` (~line 11217): `if (seKind === 1) magiStats.seFixed++; else if (seKind === 2)
     magiStats.seAlternative++;`. Update the `magiStats` comment (~line 7129) to name the two counters.
  2. **The $0 guard.** In the 9a block, right after step 1 (`const d1A = SE_HEALTH[0], d1B = SE_HEALTH[1];`), hold only when
     `d1A + d1B > 0`: restructure so that a zero step-1 deduction does not set `seHeld` and does not `continue`, and the pass falls
     through to the forced-pass block exactly as it did before 8b (at `ebda26d`) (the step-1 `costAt` call leaves
     `lastCost` changed; confirm that nothing on the fall-through path reads `lastCost` before calling `costAt` itself, and say so).
     `R side business stream` must stay byte-identical.
  3. **The search as one helper.** Move the search (step 1, the bisections, the 5.02 fallback; it sets `fixA`, `fixB`, `needAlt`
     and returns whether anything is held) into a closure built on first use in the year (`let seSearch = null;` next to
     `costAt`; `if (seSearch === null) seSearch = ...`), so a year that never switches allocates nothing, and both the switch and
     the re-check call it with the draws they price.
  4. **The re-check (decision 11).** Next to `seKind` add `let seRechecked = false;` and carry and reset it exactly like `seHeld`.
     Between the forced-pass pick block (it ends with `if (last && Math.abs(last.charged - last.realized) > 5) phaseUnresolved =
     true;` and its closing brace, ~line 11056) and `if (forcedPass && flow < 0) {` (~line 11057), insert:
     `if (seHeld && !seRechecked && !unconverged && !forcedPass && !replaying) {` run the search at this pass's draws
     (`traditionalGross`, `taxableGainGross`); if `|fixA - estSeA| + |fixB - estSeB| > 1`: `estSeA = fixA; estSeB = fixB;
     seKind = needAlt ? 2 : 1; seRechecked = true; estTrad = realizedTrad; estGain = taxableGainGross; passLog.length = 0;
     phasePass = -1; continue;` (one re-hold at most; a held year that ends in the forced pass keeps its hold). Check that the
     ~line 11056 position is reached by a converged held pass and not by an unconverged one that `continue`d earlier; if the loop's
     exit for a converged pass is elsewhere, put the re-check just before that exit and say where.
  5. Comments: the iteration comment (~line 10541), the 9a block's comment and the forced-pass comment mention the re-check and
     the $0 guard.
- [ ] **Step 3: Run.** The Step 1 tests pass; `node tests/se_health.js`, `node tests/cliff_plan.js`, `node tests/aca_magi_iteration.js`,
  `node tests/aca_medicaid.js`, `node tests/two_return_magi.js`, `node tests/tax_caches.js` pass. Re-run the Task 9 scans (single
  66,000-76,000 by 250 and joint 90,000-101,000 by 500, year 0, and the inflated consistency check): unchanged. Then
  `node tests/snapshot.js`: list every E1c entry that moved, with the first differing year, `healthcare`, `magiProxy`, the
  deduction before -> after, depletion before -> after and which change moved it; then `npm run snapshot:update` (restore
  `ui_*.json` if it rewrites them with a flaky `histSuccess`) and confirm the `us.json` diff touches only those entries.
- [ ] **Step 4: Timing.** `node tests/bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21` three times (median per path
  within +5%) and `node tests/bench_solver.js --base ../fp-e1c-base --rounds 31` twice, on a quiet machine. If a path fails, also
  run the interleaved bench against `9b47b3a` (a temporary worktree) and report both; do not try unplanned changes.
- [ ] **Step 5: Commit** `E1c 10a: a held 162(l) deduction is re-checked once at the year's final draws; no hold at a $0 deduction; the hold counters count the kept phase` with `Planner_US.html`, `tests/se_health.js` and `tests/snapshots/us.json` if it changed.

#### Commit 10b: docs

- [ ] **Step 1:** `CLAUDE.md`: remove the duplicate `Test: tests/se_health.js.` line; rewrite the 8b sentence that says the switch
  fires where there is "no consistent answer ... $69,000 to $81,000" (the switch fires in a year whose iteration does not
  converge; it holds the consistent deduction when one exists, else the alternative calculation; a held year is re-checked once
  at its final draws; nothing is held at a $0 step-1 deduction; the counters count the kept phase).
- [ ] **Step 2:** `docs/next-batches-plan.md`: an `E1c: review fixes, round 3 (Task 10)` paragraph after the Task 9 one (commits,
  red runs, the grid counts at `9b47b3a` and at the tip, the moved entries table, timing).
- [ ] **Step 3:** `npm test` green. **Commit** `E1c 10b: docs for Task 10` with the touched paths.

Report: the two commits, the red runs, the households used, the grid counts before and after, the moved E1c entries table, the
timing runs, and anything that did not go as planned.

### Task 11: Withdraw the re-check (owner decision, 2026-10-09; spec decision 12)

The spec owner's review of `1f43dac` (`docs/next-batches-plan.md`, "E1c: review, part 5") found that decision 11's re-hold can
deduct more than the premium paid, which the law forbids. Grid (single, 60, retiring at 60, one `kind: 'self'` stream owned by A
of 20,000-60,000 by 1,000, spending 20,000-40,000 by 1,000, taxable 500,000 at 30% and 60% basis, `tx`, premium 18,000, inflation,
income growth and medical inflation 0, no housing cost, years 0-4; 8,610 years): years with `seHealthA > healthcare + 1`: 0 at
`9b47b3a`, 224 at `1f43dac`, worst $12,829 (basis 30, stream 26,000, spending 26,000, year 4: D 18,000, premium 5,171, MAGI 51,922;
section 5.02 at that year's own income gives D 5,171 and premium 18,000). The re-hold flips across the 400% line. Decision 12: the
re-check and re-hold are withdrawn; the $0 guard, the kept-phase counters, the search closure and the joint split test stay; the
understatement left by a hold priced on moving draws is a recorded, conservative limitation, and the exact fix (a settlement at
the final draws) is designed for Batch 5. Two commits. Line numbers are at `1f43dac`.

**Global rules:** every entry that existed at `ee7a789` stays byte-identical (dump of `../fp-e1c-base` against the tree, the tree's
scenario list: only E1c's ten scenario files may differ). Stronger, for this task: the tree after 11a must reproduce `9b47b3a`
exactly: a dump of a `9b47b3a` worktree against the tree (the tree's scenario list) shows **0** files differ, and the invariant
grid below gives row-for-row identical JSON at `9b47b3a` and at the tree. Badge stays V125. No other change.

#### Commit 11a: remove the re-check; the invariant grid test

- [ ] **Step 1: The test first** (`tests/se_health.js`, in the Task 10a section; run red at `1f43dac` and record the output).
  Replace the `recheck` and `grid` cases by one case `invariant grid` (keep `zero` and `joint`):
  single, 60, retiring at 60, main income 0 (`incomeKindA: 'wages'`), one self stream owned by A (`selfStream(amount, 60, 70)`),
  `NOHOUSE`, taxable 500,000 at `basisRatio` 30 and 60, `tx`, `acaEnabled: true`, premium 18,000, `inflation`, `incomeGrowth`,
  `medicalInflation` 0, `ssMonthlyA: 0`; stream 20,000-60,000 by 2,000; spending 20,000-40,000 by 2,000; years 0-4. Run the grid
  inside ONE `page.evaluate` (as the spec owner's probe did) so it stays fast. For every year with `sePlanNetA > 0`, assert:
  - `seHealthA <= healthcare + 1` (the deduction never exceeds the premium paid; red at `1f43dac`);
  - `seHealthA <= sePlanNetA + 1e-6`;
  - `|healthcare - acaNetCost(magiProxy, 1, 18000, y)| <= 2`.

  Also count (report, do not assert) the years where `seHealthA` is more than $1 below `S`, the search at the final draws (the
  `searchAt` helper), and the largest such gap: the recorded limitation.
- [ ] **Step 2: The code.** Remove the decision 11 re-check block (`if (seHeld && !seRechecked && !unconverged && !forcedPass &&
  !replaying) {`, just before `if (forcedPass && flow < 0) {`) and `seRechecked` everywhere (declaration, the `naturalRec` literals,
  `trialRecs.push`, the replays, the trial-start reset). Keep `seSearch`, the $0 guard, `seKind` and its kept-phase counting.
  Update the comments that describe the re-check (the iteration comment, the 9a block, the forced pass) to say a hold is not
  re-checked and why (decision 12).
- [ ] **Step 3: Run.** `node tests/se_health.js`, `node tests/cliff_plan.js`, `node tests/aca_magi_iteration.js`,
  `node tests/tax_caches.js` pass; `node tests/snapshot.js` passes against the committed baseline. The two exactness checks of the
  global rules (a `9b47b3a` temporary worktree: snapshot dump 0 differ; the invariant grid's rows identical, compared as JSON).
  Timing: `node tests/bench_runs_interleaved.js --base ../fp-e1c-base --rounds 21` three times and once against the `9b47b3a`
  worktree; report the medians (recorded; the owner decides on any path over +5%).
- [ ] **Step 4: Commit** `E1c 11a: withdraw the decision 11 re-check (a re-hold could deduct more than the premium paid); invariant grid test` with `Planner_US.html` and `tests/se_health.js`.

#### Commit 11b: docs

- [ ] `CLAUDE.md`: replace the re-check sentence with decision 12 (a hold is priced on the draws of the pass that failed to
  converge and is not re-checked; the deduction can be understated when the draws move afterwards, never overstated in the grid;
  the exact settlement is Batch 5's). `docs/next-batches-plan.md`: an `E1c: review fixes, round 4 (Task 11)` paragraph after the
  Task 10 one (the red run, the grid counts, the exactness checks, timing). `npm test` green. **Commit**
  `E1c 11b: docs for Task 11` with the touched paths.

Report: the two commits, the red run, the invariant grid counts (years checked, understated years and the largest gap), the two
exactness checks, the timing runs, and anything that did not go as planned.
