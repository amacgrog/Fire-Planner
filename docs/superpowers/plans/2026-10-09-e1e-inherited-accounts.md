# E1e: inherited traditional and Roth IRA / 401(k) accounts (US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a household enter an IRA or 401(k) inherited from someone outside it (traditional or Roth, received in the
past or the future) and project it as a real account: grown at the year's stock return, drawn on the legal schedule (the
10-year rule with an RMD floor, or the pre-2020 stretch), taxed on the owner's federal and state returns, drawn earlier as
a last resort, and counted in net worth, the guardrails and the estate.

**Architecture:** A per-run ledger (`inheritedLedger`, null for every legacy state) holds one slot per inherited row; a pure
`inheritedDraw` gives each row's draw for the year; the scheduled traditional draw rides the `rmd` path (into `flow`, and
into `otherA/B` through new `buildTaxProfile` arguments), the Roth payout is a transfer to cash. A new
`STATE_RULES.inherited` field (five kinds) is evaluated in `stateIncomeTax` from five new state-sources fields written on
every call. A last-resort step inside the US-only withdrawal steps draws inherited money before home equity, priced through
profile fields and carried through the MAGI iteration as a fourth estimate (`estInhA/B`, E1c's `estSeA/B` pattern). The
guardrails and lambda record the need with the scheduled draw added back net of its own tax and premium.

**Tech Stack:** `Planner_US.html` (one inline `<script>` IIFE, no build), Node + Playwright tests (`tests/*.js`,
`test_*.js`), `scripts/gen-state-rules.js`.

**Spec:** `docs/superpowers/specs/2026-10-09-e1e-inherited-accounts-design.md` at this plan's commit (read all of it first:
decisions 1-17, section 6 in full, section 7, appendix A; this plan argues from it and cites its sections as "spec 6.4").
Background: `CLAUDE.md` ("MAGI iteration (both engines)" including "Third estimate (US, E1c)", "State income tax (US,
`STATE_RULES`...)", "Tax-code hot-path rules", "Per-year helpers", "Add-as-you-go lists" and its E1d paragraph,
"Testing checklist"); the E1d plan `docs/superpowers/plans/2026-10-09-e1d-one-time-income.md` and `tests/lump_income.js`
for the one-time income code and the test boilerplate this plan mirrors.

**Tasks and the spec's commits (spec section 8):** spec commit 1 is Tasks 1 (the data) and 2 (the evaluator), split for
review size; spec commit 2 is Task 3; spec commit 3 is Tasks 4 (the account) and 5 (the need readers); spec commit 4 is
Task 6; spec commit 5 is Task 7. One commit per task; every commit keeps every existing snapshot entry unchanged and adds
no scenario before Task 7.

## Global Constraints

- Worktrees: `git -C C:\Users\Alex\code\Fire-Planner worktree add ../fp-e1e -b claude/e1e-inherited-accounts PLAN_COMMIT`
  (PLAN_COMMIT = the commit that adds this plan); baseline `git -C C:\Users\Alex\code\Fire-Planner worktree add --detach
  ../fp-e1e-base PLAN_COMMIT` (the planner code at PLAN_COMMIT is identical to `02fd1cb`'s). Link `node_modules` into each
  as a directory junction from `../fp-e1b` (`cmd /c mklink /J node_modules ..\fp-e1b\node_modules` inside the worktree).
- Never edit, stash, check out, reset or commit in `C:\Users\Alex\code\Fire-Planner` (the owner's checkout and stashes).
  Never push, open a PR or merge.
- **US only.** No change to `Planner_Canada.html`, `shared/`, or any `@@shared` region. In particular
  `BUCKET_DOWN_YEAR_ORDER` / `BUCKET_UP_YEAR_ORDER` (inside `@@shared:BUCKET_DOWN_YEAR_ORDER`), `takeCash` /
  `takeHomeEquity` (inside `@@shared:takeCash`), `takeTaxable`, `sweepExcessCash`, `normalizeLists` (inside
  `01-LIST_MAX`) and `23-dynFieldHtml` must not change. Check every edit site against the `@@shared:... begin/end` pairs.
  `npm run check:shared` prints OK at every commit. Never run `npm run sync`.
- `npm test` green at every commit.
- **Exactness:** no existing entry of `tests/snapshots/us.json` or `canada.json` may change in any commit. Tasks 1-6 add
  no snapshot scenario: `node tests/snapshot.js` must pass against the committed baseline after each; on a difference, stop
  and find the changed sum order, never update. Task 7 adds the new scenarios: the json diff shows added entries only.
  Every new term is skipped (not added) when there is no inherited row, or appended AFTER today's terms (`x + 0` leaves a
  double unchanged; inserting a term in the middle of a sum does not).
- `tests/snapshots/legacy_state.json` changes only in Task 3 (new corpus cases) and the commit says so. `ui_us.json`
  changes only in Task 1 (the state rows' `notes`, which render in `#stateTaxNote` inside `<main>`: text hashes and
  lengths only; the default state is `ma`), Task 4 (the one-time income list `note` and `tip`, which sit inside `<main>`,
  whose `innerText` `tests/snapshot_ui.js` hashes (~262): text hashes and lengths only, as E1d's `12d2970` moved three)
  and Task 7 (the Methodology sentence, if changed); the commit says which hashes moved and why. Any other `ui_us.json`
  change: stop and report.
- No heuristic, gate or threshold the spec does not name. Where the spec gives a formula, implement that formula.
- **Timing** (Tasks 2, 4, 5, 6, 7): `node tests/bench_runs_interleaved.js --base ../fp-e1e-base --rounds 21`, at most +5%
  per path, the median of three runs on a quiet machine (never while another chat runs probes on this machine). Report the
  tables verbatim.
- Each commit: only your paths, `git commit -m "..." -- <paths>` (`git add` new files first), message ending
  `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- Ledger and task reports in `.superpowers/sdd/2026-10-09-e1e/` inside the worktree (git-excluded).
- Shell: never put Markdown backticks inside a double-quoted shell string; write text to a file and insert it with a small
  node script. The tree is CRLF; never use `sed -i` on any tracked file (it strips CRLF); edit with the Edit tool or node.
- Tests are written FIRST and run red (each task's Step 2); record the red output in the task report.
- Line numbers below are at PLAN_COMMIT and drift as you edit; find each site by the quoted code.
- Hand-computed expectations are numbers worked by hand (shown in the plan), never values produced by calling the
  engine's own formula (spec section 7, review 1).

## Review Focus

1. **A past row from a pre-2020 death and the clock.** Received at an age that maps to 2014 or 2018 with `currentYear`
   2026: a stretch row (RMD only, no deadline, opens even if more than 10 years back); 2020 maps to a 10-year row. A
   person would expect an account they already hold to appear. Task 4, Step 1 (cases `stretch 2018`, `stretch 2014`,
   `ten-year 2020`, `closed 2015 is stretch`, `closed ten-year window (clock 2032)`).
2. **The fourth estimate through the cliff-plan phases** (`passLog`, the pick restore, the 162(l) hold, the apply fallback
   replay, the winner replay, the trial seed): every site that restores `estSeA/B` from a record restores `estInhA/B`
   from the same record, and every record carries the realized pair. Task 6, Step 3.5 (the records bullet); pinned by
   Task 6, Step 1 (cases `identity, ACA multi-pass`, `forced pass`, `placements` with the cliff plan on) and
   `node tests/plan_off_anchor.js`.
3. **A last-resort draw in a year the one-person tax branch reads only slot A** (single-person mode, the survivor period,
   the receipt year): taxed exactly like a scheduled draw. Task 6, Step 1 (cases `survivor last resort A dies`,
   `B dies`, `receipt-year last resort`, `single-person`).
4. **Two inherited rows in one year with different owners and kinds** (a traditional for A received in 2024, a Roth for B
   received next year): each on its own slot, the Roth untouched until its year 10. Task 4, Step 1 (case `two rows`).
5. **A user switches the state while an inherited row exists** (PA exempt, NY decedent, WA no ordinary tax, MI
   ordinary): each state's tax on the same draw matches its kind, and no stale value carries into the next run in the same
   page. Task 2, Step 1 (stale-source guard) and Task 4, Step 1 (engine households).
6. **The successor year of a stretch row** (spec 6.2): the heir's death year Y is still a stretch year (its draw is not
   lost), the 10-year schedule starts at Y + 1, and the RMD floor keeps the heir's factor continued (d = L - (year -
   receiptYear) + 1), not a factor restarted at L. Task 4, Step 3.1 (`inheritedYear`, the successor rule); pinned by Task 4,
   Step 1 (case `stretch successor`, an 80-year-old heir, where the two readings give different draws).

---

### Task 1: The `inherited` state-rule field on all 51 rows, `singleLifeFactor` (US; no number change)

**Files:**
- Modify: `Planner_US.html`: each `STATE_RULES` row (between `// STATE_RULES:begin` and `// STATE_RULES:end`, ~5100-5990)
  gains `inherited` and one sentence in `notes`; a new `singleLifeFactor(age)` just below `singleLifeDivisor` (~6578).
- Modify: `scripts/gen-state-rules.js` (list the field), `docs/state-tax-rules.md` (regenerated with `npm run gen:states`),
  `tests/state_rules.js` (coverage), `tests/snapshots/ui_us.json` (text hashes only).
- Create: `tests/inherited_accounts.js` (started here with the table check; add it to `package.json`'s `test` script right
  after `node tests/lump_income.js`).

**Interfaces:**
- Produces: on every row `inherited: { kind: 'ordinary' | 'exempt' | 'heir' | 'heirAnyAge' | 'decedent' }`, and for
  `decedent` also `cap: 20000` (New York only). `singleLifeFactor(age)`: the Treas. Reg. 1.401(a)(9)-9(b) Single Life Table
  for ages 0 to 120, `Math.round(age)`, ages above 120 read 1.0, below 0 read 84.6. `window.__test_inherited =
  { singleLifeFactor }` (later tasks add to this object). Task 2 compiles the field; Task 4 uses `singleLifeFactor`.

- [ ] **Step 1: Write the failing tests**

In `tests/state_rules.js` (read the file first: `checks()` runs in the page, takes `rules = t.STATE_RULES` and records
failures with `need(cond, msg)`; `checkRow` (~46) requires each row's key set to equal `FIELDS` (~29) exactly, and runs
again on every built schedule variant (~133)):

1. Add `'inherited'` to `FIELDS` (after `'retirementExclusion'`). Leave `SCHEDULE_KEYS` (~30) without it: the existing
   check `Object.keys(over).every((k) => SCHEDULE_KEYS.includes(k))` already rejects a schedule entry that overrides
   `inherited`, so no separate schedule check is written. (Until Step 3 adds the field, `checkRow` fails every row with
   `fields missing inherited`: that is part of the red run.)
2. After the per-row loop, add:

```js
  // E1e: every row declares how it taxes an inherited traditional draw (spec 6.4, appendix A).
  const INH_KINDS = ['ordinary', 'exempt', 'heir', 'heirAnyAge', 'decedent'];
  for (const [code, row] of Object.entries(rules)) {
    const inh = row.inherited;
    need(!!inh && INH_KINDS.includes(inh.kind), code + ': inherited.kind missing or invalid');
    if (!inh) continue;
    need(inh.kind === 'decedent' ? typeof inh.cap === 'number' && inh.cap > 0 && Object.keys(inh).length === 2
      : Object.keys(inh).length === 1, code + ': inherited carries kind only (decedent: kind and a positive cap)');
    if (inh.kind === 'heir' || inh.kind === 'heirAnyAge') {
      need(row.retirementExclusion.kind !== 'none', code + ': ' + inh.kind + ' needs a retirement exclusion');
      // The heir exclusion is not gated by rule.ordinary (spec 6.4): a heir row must tax ordinary income. No row breaks
      // this today; the check keeps it so.
      need(row.base.ordinary === true, code + ': ' + inh.kind + ' needs base.ordinary');
    }
    if (inh.kind === 'heirAnyAge') need(row.retirementExclusion.kind === 'perPerson', code + ': heirAnyAge needs perPerson');
  }
  // The assignments of spec appendix A, pinned.
  const EXPECT = { pa: 'exempt', il: 'exempt', ms: 'exempt', ia: 'exempt', ny: 'decedent', co: 'heirAnyAge', ar: 'heirAnyAge',
    ok: 'heirAnyAge', ga: 'heir', ct: 'heir', de: 'heir', ky: 'heir', la: 'heir', mo: 'heir', nj: 'heir', wi: 'heir' };
  for (const [code, row] of Object.entries(rules)) {
    const want = EXPECT[code] || 'ordinary';
    need(!row.inherited || row.inherited.kind === want, code + ': inherited ' + (row.inherited && row.inherited.kind) + ', expected ' + want);
  }
  need(!rules.ny.inherited || rules.ny.inherited.cap === 20000, 'ny: decedent cap 20000');
```

Create `tests/inherited_accounts.js` with the boilerplate of `tests/lump_income.js` (chromium, clock pinned to
2026-06-15T12:00:00Z, `pageerror` collected, `near`) and the Single Life Table check (values copied from
https://www.law.cornell.edu/cfr/text/26/1.401(a)(9)-9 paragraph (b); verify each against the page when you type it):

```js
  // Treas. Reg. 1.401(a)(9)-9(b), Single Life Table (distribution calendar years from 2022), ages 0..120.
  const SLT = [84.6, 83.7, 82.8, 81.8, 80.8, 79.8, 78.8, 77.9, 76.9, 75.9, 74.9, 73.9, 72.9, 71.9, 70.9, 69.9, 69.0, 68.0,
    67.0, 66.0, 65.0, 64.1, 63.1, 62.1, 61.1, 60.2, 59.2, 58.2, 57.3, 56.3, 55.3, 54.4, 53.4, 52.5, 51.5, 50.5, 49.6, 48.6,
    47.7, 46.7, 45.7, 44.8, 43.8, 42.9, 41.9, 41.0, 40.0, 39.0, 38.1, 37.1, 36.2, 35.3, 34.3, 33.4, 32.5, 31.6, 30.6, 29.8,
    28.9, 28.0, 27.1, 26.2, 25.4, 24.5, 23.7, 22.9, 22.0, 21.2, 20.4, 19.6, 18.8, 18.0, 17.2, 16.4, 15.6, 14.8, 14.1, 13.3,
    12.6, 11.9, 11.2, 10.5, 9.9, 9.3, 8.7, 8.1, 7.6, 7.1, 6.6, 6.1, 5.7, 5.3, 4.9, 4.6, 4.3, 4.0, 3.7, 3.4, 3.2, 3.0, 2.8,
    2.6, 2.5, 2.3, 2.2, 2.1, 2.1, 2.1, 2.0, 2.0, 2.0, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.6, 1.4, 1.1, 1.0];
  assert.strictEqual(SLT.length, 121);
  for (let age = 0; age <= 120; age++)
    assert.strictEqual(await page.evaluate((a) => window.__test_inherited.singleLifeFactor(a), age), SLT[age], `SLT ${age}`);
  assert.strictEqual(await page.evaluate(() => window.__test_inherited.singleLifeFactor(125)), 1.0, 'SLT above 120');
```

(`singleLifeDivisor`, the 72(t) table, is not touched; its existing tests keep guarding it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/state_rules.js` -> FAIL (`al: fields missing inherited`, `al: inherited.kind missing or invalid`, ...). Run: `node tests/inherited_accounts.js`
-> FAIL (`window.__test_inherited` undefined).

- [ ] **Step 3: Implement**

1. Add `inherited` to every row, placed right after the row's `retirementExclusion` field, with the kinds of `EXPECT`
   above (every other row, including the no-tax rows and WA: `{ kind: 'ordinary' }`; NY: `{ kind: 'decedent', cap: 20000
   }`). No `schedule` entry gets the field.
2. Add one sentence to each taxing row's `notes` (the no-tax rows unchanged), from spec appendix A, in the row's own
   voice: placed before the row's `Not modeled: ...` sentence (six rows: CA, MA, NM, NY, PA, DC; in PA that sentence is
   followed by the Tax Forgiveness sentence, so insert before it, not at the end), else at the end.
   The exact sentences:
   - `exempt` (PA): `Inherited IRA and 401(k) distributions are not taxed (paid by reason of death).` IL: `Inherited IRA
     and 401(k) distributions are subtracted, like all IRA and plan distributions.` MS: `Inherited IRA and 401(k)
     distributions are exempt (a distribution after death is not an early distribution).` IA: `Inherited IRA and 401(k)
     distributions are excluded (a survivor with an insurable interest in a qualifying decedent; a parent assumed).`
   - NY: `Inherited IRA and 401(k) distributions get the decedent's own $20,000 pension exclusion, separate from yours and
     at any age (one beneficiary and a decedent of 59 1/2 or older assumed; enter one row per decedent).`
   - CO: `Inherited IRA and 401(k) distributions are a death benefit: up to $20,000 excluded under 55, and within your own
     cap from 55.` AR: `Inherited IRA and 401(k) distributions count toward your $6,000 exemption at any age.` OK:
     `Inherited IRA and 401(k) distributions count toward your $10,000 exclusion at any age.`
   - `heir` (GA, CT, DE, KY, LA, MO, NJ, WI): `Inherited IRA and 401(k) distributions share your own retirement exclusion,
     on your own age.`
   - every other taxing row (`ordinary`, including MI, ME, SC, RI, MD and WA): `Inherited IRA and 401(k) distributions are
     taxed as ordinary income (no exclusion for a non-spouse heir).` For WA write instead: `Inherited IRA and 401(k)
     distributions are not taxed (no tax on ordinary income).` (For a row with `!rule.base.ordinary`, `stateTaxNote`
     (~6345) prints fixed text under the selector instead of the row's `notes`, so Washington's sentence shows only in
     the info bubble. That is acceptable; do not change `stateTaxNote`.)
3. `scripts/gen-state-rules.js`: list `inherited` (the kind, and the cap for New York) in each row's parameter list, in the
   same style as `retirementExclusion`. Run `npm run gen:states` and commit `docs/state-tax-rules.md`.
4. `singleLifeFactor`, just below `singleLifeDivisor`:

```js
  // E1e: the full Single Life Table (Treas. Reg. 1.401(a)(9)-9(b), distribution calendar years from 2022), ages 0-120: an
  // inherited account's yearly RMD divisor (spec 6.2). singleLifeDivisor above (72(t), 18-65) is unchanged.
  const SINGLE_LIFE_TABLE = [ /* the 121 values of the test's SLT array, ages 0..120, in order */ ];
  function singleLifeFactor(age) {
    const a = Math.round(age);
    return a >= 120 ? 1.0 : a <= 0 ? SINGLE_LIFE_TABLE[0] : SINGLE_LIFE_TABLE[a];
  }
```

   (Type the 121 numbers into `SINGLE_LIFE_TABLE`; the comment above is the only placeholder allowed and must be
   replaced.)
5. Next to `window.__test_lumpAmountsForYear` (~17165): `window.__test_inherited = { singleLifeFactor };`. This is the only assignment of the object: later tasks add
   properties to it (`window.__test_inherited.sourcesInh = ...`, `.inheritedDraw = ...`), never reassign it, so no
   earlier hook is lost.

- [ ] **Step 4: Run the tests**

`node tests/state_rules.js`, `node tests/inherited_accounts.js`: PASS. `node tests/snapshot.js`: PASS (no change).
`node tests/snapshot_ui.js`: FAIL on `ui_us.json` text hashes only (the notes). Confirm with a scratch diff that every
changed key is a `textHash` / `textLength` of a surface whose state shows `#stateTaxNote`, then
`node tests/snapshot_ui.js --update` and check the json diff has only those keys. `npm test`: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/inherited_accounts.js
git commit -m "E1e Task 1: STATE_RULES.inherited on all 51 rows (spec appendix A) with a notes sentence each, the generator and the coverage test; singleLifeFactor (full Single Life Table); ui_us.json text hashes only (the state notes); no number change" -- Planner_US.html scripts/gen-state-rules.js docs/state-tax-rules.md tests/state_rules.js tests/inherited_accounts.js tests/snapshots/ui_us.json package.json
```

---

### Task 2: The five state kinds in the evaluator, the sources fields (US; inert, no number change)

**Files:**
- Modify: `Planner_US.html`: `newStateSources` (~6700), `compileRow` (~5998-6063), `stateRetirementExclusion` (~6136-6162),
  `stateIncomeTax` (~6364-6400), `taxFor`'s three branches (~6730-7000).
- Modify: `tests/state_mechanisms.js`, `tests/inherited_accounts.js`.

**Interfaces:**
- Consumes: Task 1's `inherited` field.
- Produces: compiled rule fields `inhKind` (integer: `INH_ORDINARY = 0, INH_EXEMPT = 1, INH_HEIR = 2, INH_HEIR_ANY = 3,
  INH_DECEDENT = 4`) and `inhCap` (a number, 0 unless decedent); sources fields `inherited`, `inheritedA`, `inheritedB`,
  `inheritedExclA`, `inheritedExclB`; profile fields read by `taxFor`: `inhOn` (boolean), `inheritedA/B`, `inhExtraA/B`,
  `inhExclA/B` (numbers; written by Tasks 4 and 6). Task 4 sets them; `taxFor` writes the sources fields on every
  taxing-state call.

- [ ] **Step 1: Write the failing tests**

In `tests/state_mechanisms.js`, add cases on the synthetic row `zz` (read the file first: it builds `zz` and sources objects
by hand, ~line 37). For each, build sources with `inherited`, `inheritedA`, `inheritedB`, `inheritedExclA`, `inheritedExclB`
set explicitly, and compute the tax with the existing helper. Hand values on a flat 10% `zz` row with no deduction, no
exemption, `base.ordinary: true`, Social Security exempt, single column (state the row literal in the test):

```js
  // zz: flat 10%, no deduction/exemption; a $30,000 inherited draw, $10,000 of the filer's own IRA draw, age 50.
  // ordinary:   tax = 10% x (10,000 + 30,000) = 4,000
  // exempt:     tax = 10% x 10,000 = 1,000
  // heir with perPerson { traditionalMinAge 59.5, tiers [[0, 6000]] } at age 50: nothing excluded (under 59.5): 4,000;
  //   at age 60: min(10,000 + 30,000, 6,000) = 6,000 excluded: 10% x 34,000 = 3,400
  // heirAnyAge, same exclusion, age 50: the inherited amount bypasses the age test, the own draw does not:
  //   min(30,000, 6,000) = 6,000 excluded: 3,400; at 60: min(40,000, 6,000) = 6,000: 3,400
  // heirAnyAge with tiers [[55, 20000], [65, 24000]] (Colorado's shape), age 50: no own cap; the inherited amount up to
  //   the first tier's cap: min(30,000, 20,000) = 20,000 excluded, the own draw nothing: 10% x 20,000 = 2,000;
  //   age 60: min(40,000, 20,000) = 20,000: 2,000
  // heir with agiPhasedShare { table: [[0, 1]] } (Connecticut's shape: all of it): (10,000 + 30,000) excluded: 0
  // decedent, cap 20,000, inheritedExclA = 20,000: 10% x (40,000 - 20,000) = 2,000; inheritedExclA = 5,000: 3,500
  // WA-like: base.ordinary false, any kind: the draw never taxed: 0 (with no gains)
```

Every case's sources carry, besides the five inherited fields, the filer's own draw and age: `retirement: 10000,
retirementA: 10000, retirementB: 0` and `ages: [50]` or `ages: [60]` as the comment says (everything else 0: `wages`,
`pension`, `pensionA/B`, `gains`, `taxableSS`, `ssBenefits*`); the inherited fields are `inherited: 30000, inheritedA:
30000, inheritedB: 0`, with `inheritedExclA` as stated for the decedent cases (0 elsewhere). Write each as an assertion to
the cent. Add the decedent per return through `taxFor`'s two-filer branch (the slot-A convention of `sourcesB`): NY,
`filing: 'single', singlePerson: false`, B with `otherB` 50,000 + a 30,000 draw (`inhOn: true, inheritedA: 0, inheritedB: 30000,
inhExtraA: 0, inhExtraB: 0, inhExclA: 0, inhExclB: 20000`; every profile with `inhOn: true` carries all six inherited
fields, 0 where not stated, or `taxFor` reads `undefined` and the tax is NaN): B's state tax equals that of the same profile with `inhOn: false, inheritedB: 0,
inhExclB: 0` and `extraB` raised by 10,000 (the taxed part reaches the state through `extraB`, never `otherB`), within
$0.01, read as `taxFor` under NY minus `taxFor` under TX for each profile. Then, in `tests/inherited_accounts.js`, the **stale-source guard** (spec 7, review
B2) through the real `taxFor`, with the profile literals the engine builds:

```js
  // A profile with an inherited draw, then a legacy profile (no inh fields at all), in one page: the legacy tax equals a
  // fresh evaluation bit for bit (the sources scratch objects are reused between calls).
  const staleCheck = await page.evaluate((code) => {
    const T = window.__test_tax;
    const base = { filing: 'single', singlePerson: true, otherA: 40000, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0,
      pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 70, ageB: null, invOrd: 0, invQual: 0, year: 0 };
    return window.__test_withState({ stateTax: code }, () => {
      const fresh = T.taxFor({ ...base }, 0, 10000);
      T.taxFor({ ...base, otherA: 70000, inhOn: true, inheritedA: 30000, inheritedB: 0, inhExtraA: 0, inhExtraB: 0, inhExclA: 20000, inhExclB: 0 }, 0, 10000);
      const after = T.taxFor({ ...base }, 0, 10000);
      return { same: Object.is(fresh, after), fresh, after };
    });
  }, 'ny');
  assert(staleCheck.same, `stale source NY: ${staleCheck.fresh} vs ${staleCheck.after}`);
```

Add `window.__test_withState(patch, fn)` beside `__test_inherited` (it saves `state`, `Object.assign`s the patch, runs
`fn`, restores in `finally`; it exists for these tests only). Repeat the tax comparison for `'co'` with `extraA: 30000` in `base` (at age 70 with no other
state income a stale 30,000 gives a CO state AGI of 40,000 - 24,000 = 16,000, under CO's conforming deduction of
16,100 + 2,050 + 6,000 = 24,150, so the CO tax would be 0 either way). (A tax comparison cannot fail for PA or CT on this
profile: a stale 30,000 is fully subtracted in PA, and CT's share is 1 at a state base of 40,000 (stateRetirementExclusion reads start). It also covers only
`SOURCES_SINGLE`.) So also add `window.__test_inherited.sourcesInh = () => [SOURCES_JOINT,
SOURCES_SINGLE, SOURCES_A, SOURCES_B].map((s) => [s.inherited, s.inheritedA, s.inheritedB, s.inheritedExclA,
s.inheritedExclB])` and, for each `taxFor` branch (joint: `filing: 'mfj', singlePerson: false`; one-person: `filing:
'single', singlePerson: true`; two filers: `filing: 'single', singlePerson: false`, with B's fields as well), in NY, PA
and CT: an inherited call (every inherited and exclusion field non-zero, both slots where the branch has two), then a
legacy call of the same branch, then assert that every scratch object that branch uses (joint: index 0; one-person: 1;
two filers: 2 and 3) reads all zeros.

Also a direct check that a legacy profile pays exactly what it paid before Task 2: in `tests/inherited_accounts.js`, for
the states `ny`, `pa`, `ca`, `wa`, `co`, a fixed legacy profile's `taxFor` value equal to a constant you record by running
the same evaluation on `../fp-e1e-base` first (write the base value into the test with a comment naming the base commit).

- [ ] **Step 2: Run the tests to verify they fail**

`node tests/state_mechanisms.js`, `node tests/inherited_accounts.js` -> FAIL (inherited fields ignored; `__test_withState`
undefined).

- [ ] **Step 3: Implement**

1. `newStateSources`: add `inherited: 0, inheritedA: 0, inheritedB: 0, inheritedExclA: 0, inheritedExclB: 0` to the literal.
2. Above `compileRow`: `const INH_ORDINARY = 0, INH_EXEMPT = 1, INH_HEIR = 2, INH_HEIR_ANY = 3, INH_DECEDENT = 4;` and a
   map `const INH_CODE = { ordinary: INH_ORDINARY, exempt: INH_EXEMPT, heir: INH_HEIR, heirAnyAge: INH_HEIR_ANY, decedent:
   INH_DECEDENT };`. In `compileRow`: `const ik = row.inherited ? row.inherited.kind : 'ordinary';` (a test-only synthetic
   row may omit the field: `mk()` in `tests/state_mechanisms.js` ~23, `R.zzx` in `tests/income_streams.js` ~92,
   `tests/self_employment.js` ~53 and `tests/state_extra_income.js` ~19, `R[zz]` in `tests/state_child_credits.js` ~29;
   `tests/state_rules.js` requires it on every real row), then in the returned object `inhKind: INH_CODE[ik]` and `inhCap:
   ik === 'decedent' ? row.inherited.cap : 0` (compiled per variant, because `compileStateRule` builds each variant with
   `compileRow(current)`). Those five test files are not edited.
3. `taxFor`: read once at the top, beside `lumpOn`: `inhOn = profile.inhOn === true`. In each branch, in the `if
   (stateOn)` block, write the fields on every call (spec 6.4):
   - joint: `if (inhOn) { sources.inheritedA = profile.inheritedA + profile.inhExtraA; sources.inheritedB =
     profile.inheritedB + profile.inhExtraB; sources.inherited = sources.inheritedA + sources.inheritedB;
     sources.inheritedExclA = profile.inhExclA; sources.inheritedExclB = profile.inhExclB; } else { sources.inherited = 0;
     sources.inheritedA = 0; sources.inheritedB = 0; sources.inheritedExclA = 0; sources.inheritedExclB = 0; }`
   - one-person: the same with slot A only (`inheritedA = profile.inheritedA + profile.inhExtraA`, `inheritedB = 0`,
     `inheritedExclA = profile.inhExclA`, `inheritedExclB = 0`).
   - two filers: `sourcesA` gets slot A (`inheritedA = profile.inheritedA + profile.inhExtraA`, `inheritedExclA =
     profile.inhExclA`, B fields 0); `sourcesB` gets B's amounts **in its slot A** (`inheritedA = profile.inheritedB +
     profile.inhExtraB`, `inheritedExclA = profile.inhExclB`, B fields 0), as `retirementA` is filled for B's return.
   Federal side (needed from Task 6; harmless now because no profile carries `inhExtraA/B` yet): in each branch add
   `inhExtra` to the other-income sum beside the `seH` terms, only under `inhOn` (spec 6.6, review 2 item 2):
   `const otherAB = (seOn ? ... : ...) ` becomes followed by `+ (inhOn ? profile.inhExtraA + profile.inhExtraB : 0)` **only
   when inhOn** (write it as `let otherAB = <today's expression>; if (inhOn) otherAB += profile.inhExtraA +
   profile.inhExtraB;` so a legacy call computes the very same double); likewise `otherA1` (`+= profile.inhExtraA`),
   `otherA2` (`+= profile.inhExtraA`), `otherB2` (`+= profile.inhExtraB`). The scheduled draw is already inside
   `profile.otherA/B` (Task 4), so it is never added here.
4. `stateIncomeTax`: right after `ordinaryNonSS` is computed (keep that `const` as it is and add a `let` copy):

```js
      // E1e: an inherited traditional draw (spec 6.4). Every read sits inside this gate: test sources objects may lack the
      // fields, and a legacy call computes exactly today's doubles.
      const inh = sources.inherited > 0 ? sources.inherited : 0;
```

   then make the base use it only when non-zero: replace `let start = rule.ordinary ? ordinaryNonSS + includedGains :
   includedGains` by
   `let start = rule.ordinary ? (inh > 0 ? ordinaryNonSS + inh : ordinaryNonSS) + includedGains : includedGains`.
   (Associativity: for `inh === 0` the expression is the old one exactly.) Then the subtraction, where `agi` is computed:
   `let agi = start - ssSubtraction - stateRetirementExclusion(...)` gains, appended after it, `if (inh > 0 && rule.ordinary)
   agi -= inheritedExclusion(rule, sources, fRe, colKey, start, ssSplit, inh);` and `stateRetirementExclusion` receives
   `rule.inhKind` so it can fold the inherited amount into the `heir` / `heirAnyAge` kinds (see 5). To keep one place per
   kind:
   - `INH_ORDINARY`: `inheritedExclusion` returns 0.
   - `INH_EXEMPT`: returns `inh`.
   - `INH_DECEDENT`: returns `Math.min(inh, sources.inheritedExclA + sources.inheritedExclB)`.
   - `INH_HEIR` / `INH_HEIR_ANY`: returns 0 here (the exclusion is inside `stateRetirementExclusion`, so the shared cap is
     honoured).
5. `stateRetirementExclusion(ex, sources, factor, colKey, agi, ssSplit, inhKind = INH_ORDINARY)`:
   - `perPerson` loop, per filer i, with `inh_i = (inhKind === INH_HEIR || inhKind === INH_HEIR_ANY) && sources.inherited >
     0 ? Math.max(0, (i === 0 ? sources.inheritedA : sources.inheritedB) || 0) : 0`:
     - today's `cap < 0 -> continue` path: for `INH_HEIR_ANY` with `inh_i > 0`, instead of `continue`, add
       `Math.min(inh_i, firstCap)` where `firstCap` is the first tier's cap (`ex.tierCaps[0]`, a number or the column's
       value) times `factor`, and `continue` (the filer's own pension and draws still get nothing; spec 6.4 CO case);
     - otherwise, the traditional term: `traditional` (today's expression) plus, for `INH_HEIR`, `inh_i` only when `age >=
       ex.tradFrom` (the heir's own age test; never through `employerPlan`), and for `INH_HEIR_ANY` always `inh_i`; the
       existing `Math.min(pension + traditional, room)` then caps the sum. Write it so that with `inh_i === 0` the
       arithmetic is today's (`traditional + inh_i` only when `inh_i > 0`).
   - `agiPhasedShare`: `const retirement = Math.max(0, sources.pension + sources.retirement)` gains `+ sources.inherited`
     only when `inhKind === INH_HEIR && sources.inherited > 0` (Connecticut, spec 6.4 S6; there is no `inh` variable in
     `stateRetirementExclusion`): write `let retirement = <today's expression>; if (inhKind === INH_HEIR &&
     sources.inherited > 0) retirement += sources.inherited;` so the legacy double is unchanged.
   - The `ex.share` multiplier applies to the sum as today.
6. `window.__test_withState` as described in Step 1.

- [ ] **Step 4: Run the tests**

`node tests/state_mechanisms.js`, `node tests/inherited_accounts.js`, `node tests/tax_caches.js`, `node tests/snapshot.js`:
PASS. `npm test`: PASS. Timing gate (bench) and record the tables.

- [ ] **Step 5: Commit**

```bash
git commit -m "E1e Task 2: the five inherited kinds in stateIncomeTax / stateRetirementExclusion, the sources fields written on every taxing-state call (spec 6.4), inhExtra in taxFor's other-income sums under inhOn; inert (no profile carries an inherited amount yet); no number change" -- Planner_US.html tests/state_mechanisms.js tests/inherited_accounts.js
```

---

### Task 3: Normalization of the two kinds (US; no number change)

**Files:**
- Modify: `Planner_US.html`: `normalizeUsLumps` (~1169-1184), `lumpAmountsForYear` (~10205-10238).
- Modify: `tests/legacy_state.js`, `tests/snapshots/legacy_state.json`, `tests/lump_income.js`.

**Interfaces:**
- Produces: normalized rows may carry `kind: 'inheritedTrad' | 'inheritedRoth'`; `lumpAmountsForYear` skips both (they
  contribute nothing to any `LUMP_OUT` field). The select does NOT offer them yet (Task 4 adds the options; spec 8, review
  3 M-9).

- [ ] **Step 1: Write the failing tests**

`tests/legacy_state.js`, next to the `'lump ...'` cases:

```js
  'inherited kinds': { oneTimeIncome: [
    { amount: 400000, age: 60, flat: false, kind: 'inheritedTrad', owner: 'B' },
    { amount: 100000, age: 52, flat: true, kind: 'inheritedRoth' },
    { amount: 1000, age: 61, kind: 'inherited' },
    { amount: 1000, age: 62, kind: 'inheritedTrad', owner: 'b' },
    { amount: 50000, age: 40, kind: 'inheritedTrad', owner: 'A' }, // a past row (spec 7); normalization ignores the age
  ] },
```

Assert the normalized kinds `['inheritedTrad', 'inheritedRoth', 'free', 'inheritedTrad', 'inheritedTrad']` and owners
`['B', 'A', 'A', 'A', 'A']` explicitly, beside the pinned snapshot. `tests/lump_income.js`, in the pure splitter cases:

```js
  is(await fn([L({ kind: 'inheritedTrad' })]), {}, 'inherited traditional is not a lump');
  is(await fn([L({ kind: 'inheritedRoth', owner: 'B' })]), {}, 'inherited Roth is not a lump');
  is(await fn([L({ kind: 'inheritedTrad' }), L({ amount: 5000 })]), { taxFree: 5000 }, 'inherited beside a free lump');
```

- [ ] **Step 2: Run them to verify they fail**

`node tests/legacy_state.js` (kinds read `'free'`), `node tests/lump_income.js` (`taxFree: 10000` for the inherited rows).

- [ ] **Step 3: Implement**

`normalizeUsLumps`: the kind test becomes `r.kind === 'wages' || r.kind === 'ordinary' || r.kind === 'gain' || r.kind ===
'inheritedTrad' || r.kind === 'inheritedRoth' ? r.kind : 'free'`. `lumpAmountsForYear`, as the loop's first test after the
age match: `if (k === 'inheritedTrad' || k === 'inheritedRoth') continue;` (before the "unknown kind is tax-free" branch;
spec 5.2). Update the comment above `lumpAmountsForYear` to say inherited rows are read by `inheritedLedger`.

- [ ] **Step 4: Run the tests**

`node tests/lump_income.js`, `node tests/snapshot.js`: PASS. `node tests/legacy_state.js --update`, then check the json diff:
the new case only, and no existing case's hash changed (no saved state carried these kinds before). `npm test`: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "E1e Task 3: normalizeUsLumps keeps the two inherited kinds; lumpAmountsForYear skips them (spec 5.2); legacy_state.json: one new case; the select does not offer them yet; no number change" -- Planner_US.html tests/legacy_state.js tests/snapshots/legacy_state.json tests/lump_income.js
```

---

### Task 4: The account: ledger, schedule, cash flow, federal and state tax, totals, display (US; no existing number change)

**Files:**
- Modify: `Planner_US.html`: new pure functions `inheritedDraw`, `inheritedLedger`, `inheritedYear` (+ scratch `INH_OUT`),
  `inheritedClone` / `inheritedRestore`, just below `lumpAmountsForYear`; `runProjection` (the `bal` literal ~10429, the
  ledger at the top, the year loop: `buildTaxProfile` call, the snapshot / restore, `flow` ~10986, the growth / required
  distribution block ~11002-11012, `totalIncome`, the row build ~11398-11450, the trace ~11460, `estate` ~11509);
  `buildTaxProfile` (~8801, both literals); `afterTaxValue` (~9585); `DYN.oneTimeIncome` (~14833: the two options, the
  owner `showIf`, the copy); the income-group summary (~2467); a new US-only `annotateInheritedRows` after the shared
  `renderTable` call in `render()` (beside `annotateSolverRows`).
- Modify: `tests/inherited_accounts.js`, `tests/snapshots/ui_us.json` (text hashes only: the list note and tip); create
  `test_inherited_accounts.js` (repo root, Playwright, not in CI).

**Interfaces:**
- Consumes: Task 1 `singleLifeFactor`; Task 2 profile fields and state kinds; Task 3 normalized kinds.
- Produces:
  - `inheritedDraw(b, r, k, L, roth, stretch)` -> the row's draw (traditional) or payout (Roth) for draw year `k` (spec
    6.2), pure.
  - `inheritedLedger(rows, ctx)` with `ctx = { ageA, ageB, single, currentYear, deathYear, deceasedIsA, deceasedIsB }`
    -> `null` (no inherited row, or every inherited row skipped) or `{ n, roth: boolean[], owner: number[], heir:
    number[], receiptYear: number[], stretch: boolean[], L: number[], bal: Float64Array, open: Uint8Array, deadline:
    number[] }`. Every array has length `n` (the number of kept rows, not `LIST_MAX`). `owner[i]` is the NAMED owner (0 =
    A, 1 = B; `'B'` only when `!ctx.single && row.owner === 'B'`); `heir[i]` is the heir slot at receipt, derived from it
    (the named owner, or the other partner when the named owner is dead at receipt). `deadline[i]` = receiptYear + 10, or
    Infinity for a stretch row until a successor deadline is set.
  - `inheritedYear(inh, ctx, out)` with `ctx = { year, stockReturn, deadA, deadB }` (the same four fields here and in Step
    3.3) -> fills `INH_OUT = { drawA, drawB, rothPayout, any }` (`drawA/B` on PRE-remap slots: the slot of the row's current
    heir) and records each row's draw in `inh.draw[i]` (a Float64Array) for the last resort and the NY room. The New York
    base exclusion is not in `INH_OUT`: it is computed once per year after `buildTaxProfile` (Step 3.5).
  - `bal.inheritedTrad`, `bal.inheritedRoth` (always present).
  - `buildTaxProfile({ ..., inhOn = false, inheritedA = 0, inheritedB = 0 })`: profile carries `inhOn`, `inheritedA/B`
    (post-remap), `inhExtraA: 0, inhExtraB: 0`, `inhExclA/B` (0 in the literals; set once per year by Step 3.5 right after
    `buildTaxProfile` and saved as the pass-top base `inhExclBaseA/B`).
  - Year-loop locals `inh` (the ledger or null), `inhDraw`, `inhDrawA/B` (pre-remap), `inhRothPayout`.
  - Rows, only when `inh !== null` and the row is open or paid out this year: `inheritedTrad`, `inheritedRoth`,
    `inheritedDraw`. `window.__test_inherited` gains `inheritedDraw`, `inheritedLedger`.
  - The ledger also carries `openAmount: number[]`, `flat: boolean[]` (for opening a future row), `draw: Float64Array` (this
    year's scheduled draw or payout per slot, written by `inheritedYear`), `lastResort: Float64Array` (this pass's
    last-resort draw per slot, Task 6), and preallocated snapshot arrays for `inheritedClone` / `inheritedRestore`.
  - Engine `currentYear` is the closure the tests pin with `window.__test_setCurrentYear(y)` (exists, ~17200).

- [ ] **Step 1: Write the failing tests**

In `tests/inherited_accounts.js`:

Pure schedule (spec 6.2; hand-computed):

```js
  const D = (b, r, k, L, roth = false, stretch = false) => page.evaluate((a) => window.__test_inherited.inheritedDraw(...a), [b, r, k, L, roth, stretch]);
  near(await D(100000, 0.07, 1, 26.2), 10700, 0.005, 'k1 even: 107,000 / 10');
  near(await D(100000, 0.07, 9, 26.2), 53500, 0.005, 'k9 even: 107,000 / 2');
  near(await D(100000, 0.07, 10, 26.2), 107000, 0.005, 'k10 all');
  assert.strictEqual(await D(100000, 0.07, 0, 26.2), 0, 'receipt year: no scheduled draw');
  near(await D(100000, 0.07, 9, 8.1), 107000, 0.005, 'heir 85, k9: d = 0.1 <= 1, whole account');
  near(await D(100000, -0.3, 8, 8.1), 70000, 0.005, 'heir 85, k8, -30%: d = 1.1, cap at the grown 70,000 (b/d = 90,909)');
  near(await D(100000, -0.3, 1, 10.5), 9523.81, 0.005, 'heir 81, k1, -30%: RMD 100,000 / 10.5 > 70,000 / 10');
  near(await D(100000, 0.0, 1, 10.5), 10000, 0.005, 'heir 81, k1, r = 0: even 10,000 >= 9,523.81');
  near(await D(100000, -0.3, 1, 14.8), 7000, 0.005, 'heir 75, k1, -30%: 70,000 / 10 > 100,000 / 14.8 = 6,756.76');
  near(await D(100000, -0.3, 5, 14.8), 11666.67, 0.005, 'heir 75, k5, -30%: 70,000 / 6 > 100,000 / 10.8 = 9,259.26');
  near(await D(100000, 0.06, 1, 9.9), 10600, 0.005, 'heir 82 at 6%: 106,000 / 10 = 10,600 >= 10,101.01');
  near(await D(100000, 0.06, 1, 9.3), 10752.69, 0.005, 'heir 83 at 6%: 100,000 / 9.3 = 10,752.69 > 10,600');
  near(await D(100000, 0.07, 3, 5.7), 100000 / 3.7, 0.005, 'heir 90, k3: d = 3.7');
  near(await D(100000, 0.07, 6, 5.7), 107000, 0.005, 'heir 90, k6: d = 0.7, whole');
  near(await D(100000, 0.07, 3, 2.8), 107000, 0.005, 'heir 100, k3: d = 0.8, whole');
  assert.strictEqual(await D(100000, 0.07, 9, 26.2, true), 0, 'Roth k9: nothing');
  near(await D(100000, 0.07, 10, 26.2, true), 107000, 0.005, 'Roth k10: all');
  near(await D(100000, 0.05, 3, 35.3, false, true), 100000 / 33.3, 0.005, 'stretch k3, L 35.3: d = 33.3');
  near(await D(100000, 0.05, 3, 35.3, true, true), 100000 / 33.3, 0.005, 'Roth stretch: same amount');
  near(await D(100000, 0.05, 40, 35.3, false, true), 105000, 0.005, 'stretch past the factor: whole');
  // Heir 81 (L 10.5) at -30% is bound by the RMD in every year k = 1..9: the floor binds when (1 + r)(L - k + 1) < 11 - k,
  // i.e. 0.7 x (11.5 - k) < 11 - k, i.e. 0.3k < 2.95, i.e. k <= 9 (k = 1: 0.7 x 10.5 = 7.35 < 10; k = 9: 0.7 x 2.5 = 1.75 < 2).
  // Walk the balance: draw_k = b_k / (11.5 - k), b_{k+1} = 0.7 b_k - draw_k (b_1 = 100,000: draw 9,523.81, b_2 = 60,476.19,
  // draw 6,365.91 (d 9.5), b_3 = 35,967.42, draw 4,231.46 (d 8.5); the last, k = 10: 0.7 x 199.47 = 139.63); assert each of the nine draws equals b_k / (11.5 - k)
  // within $0.005 and differs from the even 0.7 b_k / (11 - k); k = 10 takes the whole 0.7 b_10.
  // Sweep (spec 7, the floor and the cap): for heir factors L in {35.3, 18.8, 10.5, 8.1, 5.7, 2.8} (ages 51, 70, 81, 85, 90,
  // 100), r in {-0.3, 0, 0.07} and k = 1..10 on b = 100,000: draw <= b (1 + r) + 0.005 and draw >= min(b (1 + r), b / (L - k
  // + 1)) - 0.005 when L - k + 1 > 1, else draw = b (1 + r); never negative.
```

Ledger (clock pinned to 2026; `currentYear` 2026; household A 55, B 53):

```js
  const LG = (rows, c = {}) => page.evaluate(([r, x]) => {
    const g = window.__test_inherited.inheritedLedger(r, { ageA: 55, ageB: 53, single: false, currentYear: 2026, deathYear: Infinity, deceasedIsA: false, deceasedIsB: false, ...x });
    return g && { n: g.n, roth: g.roth, owner: g.owner, receiptYear: g.receiptYear, stretch: g.stretch, L: g.L, bal: Array.from(g.bal), open: Array.from(g.open) };
  }, [rows, c]);
  const R = (o) => ({ amount: 100000, age: 55, flat: true, kind: 'inheritedTrad', owner: 'A', ...o });
  assert.strictEqual(await LG([{ amount: 1, age: 55, kind: 'free' }]), null, 'no inherited row: null');
  let g = await LG([R({ age: 52 })]); // received 2023: a 10-year row, k = 3 this year
  assert.deepStrictEqual([g.receiptYear[0], g.stretch[0], g.open[0], g.bal[0]], [-3, false, 1, 100000], 'past row 3 years back: open now at today\'s balance');
  // receiptYear = 52 - 55 = -3 (2023); the heir's age in the year after receipt (2024) = 55 - 3 + 1 = 53; SLT[53] = 33.4.
  assert.strictEqual(g.L[0], 33.4, 'L: heir A aged 53 in the year after receipt (2024): SLT[53] = 33.4');
  g = await LG([R({ age: 47 })]); // 2018 death
  assert.deepStrictEqual([g.stretch[0], g.open[0]], [true, 1], 'stretch 2018');
  g = await LG([R({ age: 43 })]); // 2014 death, more than 10 years back
  assert.deepStrictEqual([g.stretch[0], g.open[0]], [true, 1], 'stretch 2014 still opens');
  g = await LG([R({ age: 49 })]); // 2020 death: a 10-year row, last year 2030, open
  assert.deepStrictEqual([g.stretch[0], g.open[0]], [false, 1], 'ten-year 2020');
  g = await LG([R({ age: 44 })]); // 2015: stretch, open (the 10-year closure applies only to 2020+ rows)
  assert.strictEqual(g.stretch[0], true, 'closed 2015 is stretch');
  // With the clock at 2032, a row received 12 years back is a 2020 death: a 10-year row whose window closed in 2030.
  assert.strictEqual(await LG([R({ age: 43 })], { currentYear: 2032 }), null, 'closed ten-year window (clock 2032)');
  g = await LG([R({ age: 58, owner: 'b' })]); // future row; owner 'b' reads as A
  assert.deepStrictEqual([g.owner[0], g.open[0], g.bal[0]], [0, 0, 0], 'future row: not open yet, owner A');
  g = await LG([{ amount: 100000, age: 55, kind: 'inheritedTrad' }]); // raw row, no owner, no flat
  assert.deepStrictEqual([g.owner[0], g.receiptYear[0]], [0, 0], 'raw row');
  g = await LG([R({ owner: 'B' })], { single: true });
  assert.strictEqual(g.owner[0], 0, 'single-person: owner A');
  g = await LG([R({ age: 54.6 })]);
  assert.strictEqual(g.receiptYear[0], 0, 'Math.round(54.6) = 55');
  g = await LG([R({ age: 57, kind: 'inheritedRoth', owner: 'B' }), R({ age: 53 })]);
  assert.deepStrictEqual(g.receiptYear, [-2, 2], 'two rows, oldest receipt first (arrays of length n = 2)');
  assert.deepStrictEqual([g.owner, g.roth], [[0, 1], [false, true]], 'owner and kind follow the sort');
  g = await LG([R({ age: 43 }), { amount: 1, age: 55, kind: 'free' }], { currentYear: 2032 });
  assert.strictEqual(g, null, 'every inherited row skipped: null');
```

(`LG` returns the ledger's own arrays, so `receiptYear`, `owner`, `roth`, `stretch` and `L` must be plain arrays of length
`n`; `bal` and `open` are typed arrays of length `n`.)

Engine cases (helper `engine(patch, rows)` copied from `tests/lump_income.js`'s helper: save, delete keys, `Object.assign`,
run `window.__test_accountTrace()` and `window.__test_simulate()`, restore in `finally`; return per year the rows' fields and
the trace's `profile`). Base household `H` (copy `W` from `tests/lump_income.js` and change): `{ singlePerson: false, ageA:
60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0,
stateTax: 'tx', acaEnabled: false, guardrailsEnabled: false, returnRate: 7, inflation: 0, spending: 40000, taxable:
1000000, cash: 0, bondYears: 0, tenure: 'rent', rent: 0, ...all accounts 0, rothConvEnabled: false, cliffGuardEnabled:
false, survivorEnabled: false, ssMonthlyA: 0, ssMonthlyB: 0 }` (read the defaults for the Social Security and pension
fields' names and pin each to 0).

```js
  // A $400,000 traditional row for B received this year (age 60): no draw in year 0; years 1..10 draw 400,000 x 1.07^k / 10
  // ... (the even schedule on the balance grown each year): year 1 = 42,800.00; year 2 = (400,000 x 1.07 - 42,800) x 1.07 / 9
  // = 385,200 x 1.07 / 9 = 45,796.00; year 10 = the whole balance.
  let e = await engine(H, [R({ amount: 400000, age: 60, owner: 'B', flat: true })]);
  near(e.rows[0].inheritedDraw || 0, 0, 0.005, 'receipt year: no draw');
  near(e.rows[1].inheritedDraw, 42800, 0.01, 'year 1');
  near(e.rows[2].inheritedDraw, 45796, 0.01, 'year 2');
  assert.strictEqual(e.rows[11].inheritedTrad || 0, 0, 'empty after year 10');
  near(e.trace[1].profile.otherB - e.trace[1].profile.wageB, 42800, 0.01, "the draw in B's other income");
  // Investable includes the inherited balance: year 0 = taxable path + 400,000 x 1 (opened after growth).
```

NIIT (spec 6.3, review S4) as an engine case, so a leak through `buildTaxProfile` (the place one would come from) is seen;
a hand-built profile cannot show it, because `taxFor` never reads `inheritedA` federally:

```js
  // TX, MFJ, both 60, dividendYield 1 on taxable 1,000,000 (net investment income 10,000), A's not-earned stream 230,000,
  // A's $400,000 row received at 59 (draw 400,000 x 1.07 / 10 = 42,800). Twin: the stream at 272,800 and no row.
  // MAGI 230,000 + 10,000 = 240,000 before the draw, 282,800 with it (the twin's 282,800 too); a surplus year in both, no sale.
  // NIIT = 3.8% x min(10,000, 282,800 - 250,000 = 32,800) = 380 in both runs, and the draw and the twin's extra stream are
  // both ordinary income on A's federal return, so row.tax is equal within $0.01.
  // A leak into net investment income would add 3.8% x min(52,800, 32,800) - 380 = 1,246.40 - 380 = 866.40.
  near(inh.rows[0].tax, twin.rows[0].tax, 0.01, 'NIIT: the draw raises MAGI, not net investment income');
```

Also (each a separate engine case; write the hand values in comments as above):
- `two rows`: A's traditional received at 58 (k = 2 now) and B's Roth received at 61: B's Roth untouched until its year 10,
  then `investable` unchanged across the payout year's transfer (equal to the twin run where the Roth amount sits in cash),
  `row.tax` unchanged by the payout, `magiProxy` unchanged.
- `owner dead at receipt`: survivor enabled, A dies at 62, A's row received at 63: the draws land on the survivor's return
  (the trace's profile is one-person, slot A carries B's age).
- `owner dies in year 4`: A's row received at 60, A dies at 64: draws continue to the same deadline (year 10 empties it).
- `stretch 2018, three years` (spec 7, decision 17): `H` (A 60), A's $100,000 row received at 52 (receiptYear -8, a 2018
  death: stretch; heir A's age in 2019 = 60 - 8 + 1 = 53, L = SLT[53] = 33.4). The draw is `b / d` with `d = 33.4 - k +
  1`, `k = year + 8`, and the balance grows at 7% then loses the draw:
  - year 0: k 8, d 26.4, draw 100,000 / 26.4 = 3,787.88; end 107,000 - 3,787.88 = 103,212.12;
  - year 1: k 9, d 25.4, draw 103,212.12 / 25.4 = 4,063.47; end 110,436.97 - 4,063.47 = 106,373.50;
  - year 2: k 10, d 24.4, draw 106,373.50 / 24.4 = 4,359.57 (no deadline: year 3 still draws).
  Assert the three draws and the two year-end balances (`row.inheritedTrad`) within $0.01.
- `stretch successor` (spec 6.2, review S3): `H` with `ageA: 80, ageB: 80, retireAgeA: 80, retireAgeB: 80,
  survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 83` (deathYear = 83 - 80 = 3: A is dead from year 3, so
  Y = 3), A's $100,000 row received at 72 (receiptYear -8, a 2018 death: stretch; A's age in 2019 = 80 - 8 + 1 = 73, L =
  SLT[73] = 16.4). Years 0-3 are stretch years (`d = 16.4 - (year + 8) + 1`); from year 4 the 10-year schedule counted from
  Y with the factor continued (`L' = 16.4 - (3 + 8) = 5.4`, `k' = year - 3`, `d = 5.4 - k' + 1`, draw `min(grown, max(grown
  / (11 - k'), b / d))`):
  - year 0: d 9.4, draw 100,000 / 9.4 = 10,638.30; end 107,000 - 10,638.30 = 96,361.70;
  - year 1: d 8.4, draw 96,361.70 / 8.4 = 11,471.63; end 103,107.02 - 11,471.63 = 91,635.39;
  - year 2: d 7.4, draw 91,635.39 / 7.4 = 12,383.16; end 98,049.87 - 12,383.16 = 85,666.71;
  - year 3 (Y, A's first year dead; still a stretch year, its draw is not lost): d 6.4, draw 85,666.71 / 6.4 = 13,385.42;
    end 91,663.38 - 13,385.42 = 78,277.95;
  - year 4 (k' 1): grown 83,757.41; even 83,757.41 / 10 = 8,375.74; floor 78,277.95 / 5.4 = 14,495.92 (d = 5.4 - 1 + 1):
    draw 14,495.92 (a factor restarted at L would give d = 16.4 and the even 8,375.74; setting the deadline before year
    3's draw would give k' = 0 and no draw in year 3); end 83,757.41 - 14,495.92 = 69,261.49;
  - year 9 (k' 6): d = 5.4 - 6 + 1 = 0.4 <= 1: the whole grown balance (10,524.73 x 1.07 = 11,261.46); empty from year
    10, before the deadline Y + 10 = 13.
  Assert the draws of years 0-4 and 9 within $0.01, `row.inheritedTrad` 0 in year 10, and from year 3 the draw in the
  trace's profile slot A (`otherA`; the survivor B is remapped into slot A).
- `historical run` (growth at the path's stock return; spec 7): B's $400,000 row received this year (as the first engine
  case), run through `window.__test_accountTrace(60, 60, (y) => [2000 + y, y === 1 ? -20 : 10, 0, 3])` (percent, inflation
  0; define the row function inside `page.evaluate`) and `window.__test_simulateHistorical(rowFn)` for the rows. Year 0: opened at 400,000 (no
  growth in the receipt year). Year 1 (k 1, -20%): grown 320,000; even 32,000; floor 400,000 / SLT[61] = 400,000 / 26.2 =
  15,267.18: draw 32,000; end 288,000. Year 2 (k 2, +10%): grown 316,800; even 316,800 / 9 = 35,200; floor 288,000 / 25.2
  = 11,428.57: draw 35,200. Assert both draws within $0.01.
- `state households` (one draw year each; hand-compute the state tax difference against the twin run with no inherited
  row; read each run's state tax as `stateOf(profile, code, tradExtra)` = `taxFor` under `code` minus `taxFor` under `'tx'`
  on the trace's profile, both through `__test_withState`, `tradExtra` = the year's own discretionary traditional draw,
  `row.traditionalWithdrawn - row.inheritedDraw`; renting households on the standard deduction, so the state tax does not
  move the federal SALT deduction; a comparison profile moves a taxed amount through `extraA` / `extraB`, which
  `taxFor` puts in the state's `sources.wages`, never through `otherA` / `otherB`, which reaches only the federal return;
  `stateOf` passes zero gains, so sale gains never enter it): PA (`exempt`: the state tax equals the twin's within $0.01 (`(x + i) - i` need not be
  `x` in floating point), which also catches the draw reaching `sources.wages`), NY
  (`decedent`: a $30,000 draw at age 62 with the heir's own $20,000 pension exclusion used by a pension: the state taxes
  $10,000 of the draw), CO at 50 (`heirAnyAge`, $20,000 excluded) and at 60 (the draw shares the filer's own $20,000 cap for 55-64 with an own
  IRA draw: hand-compute `min(draw + own, 20,000)` excluded), CT (`heir`, AGI-phased), GA at 62 (`heir`, the $35,000
  shared with an IRA draw), MI (`ordinary`), WA (no state tax on the draw).
- `GA at 65` (spec 7: GA `heir` at 62 and 65): `H` with `stateTax: 'ga'`, `dividendYield: 0`, a not-earned income stream
  for A of $40,000 (`incomeSources: [{ amount: 40000, startAge: 50, endAge: 90, followGrowth: false, growth: 0, owner:
  'A', kind: 'other' }]`), and A's $400,000 row received at A's age - 1 (k = 1 in year 0: draw 428,000 / 10 = 42,800;
  no sale in the inherited run and no own traditional draw; the twin sells, but `stateOf` ignores sale gains). GA 2026: flat 4.99%, joint standard deduction $30,000,
  each filer 65 or older excludes up to $65,000 of retirement income (2026; $70,000 from 2027), 62 to 64 up to $35,000.
  - `ageA: 65, ageB: 65` (row age 64): 42,800 <= 65,000, all excluded: `stateOf(inherited, 'ga', 0)` = the twin's =
    4.99% x (40,000 - 30,000) = 499.00, within $0.01.
  - `ageA: 62, ageB: 62` (row age 61): 35,000 excluded, 7,800 taxed: 4.99% x (40,000 + 7,800 - 30,000) = 4.99% x 17,800
    = 888.22, the twin 499.00 (difference 4.99% x 7,800 = 389.22).
- `AR at 50` (spec 7: the inherited amount excluded up to $6,000 while the filer's own traditional draw is not): `H`
  with `stateTax: 'ar'`, `ageA: 50, ageB: 50, retireAgeA: 50, retireAgeB: 50`, `taxable: 0, cash: 0, tradIraA: 500000`,
  `spending: 60000`, `dividendYield: 0`, and A's $400,000 row received at 49 (draw 42,800 in year 0), so the year also
  draws A's own IRA (penalized; `t = row.traditionalWithdrawn - row.inheritedDraw > 0`, asserted). AR's exclusion is
  `perPerson`, `traditionalMinAge 59.5`, one tier `[0, 6000]`: at 50 the own draw gets nothing and the inherited amount
  bypasses the age test, `min(42,800, 6,000) = 6,000`. Assert `stateOf(profile, 'ar', t)` equals `stateOf(profile', 'ar',
  t)` within $0.01, where `profile'` is the same profile with `inhOn: false, inheritedA: 0, extraA: profile.extraA + 36800`
  (`otherA` unchanged: the state taxes `extraA` as wages, and `stateOf` cancels the federal part within each profile; the
  draw taxed like 36,800 of wages, the own draw fully taxed).
- `NY after A dies` (spec 6.4 M-1, review 3 M-1): `H` with `stateTax: 'ny'`, `survivorEnabled: true, survivorPartner:
  'A', survivorDeathAge: 62` (A dead from year 2), A's $400,000 row received at 60 (year 2 draw 45,796, on the survivor's
  return, post-remap slot A). Year 2: the trace's `profile.inhExclA === 20000`, `profile.inhExclB === 0`; B has no
  pension or IRA draw of their own, so the heir's own NY exclusion is unused; assert `stateOf(profile, 'ny', 0)` equals
  `stateOf(profile', 'ny', 0)` within $0.01 with `profile'` = `inhOn: false, inheritedA: 0, inhExclA: 0, extraA: profile.extraA + 25796`
  (`otherA` unchanged; the draw taxed like 25,796 of wages).
- `state AGI line` (spec 6.4 S8, review 3 M-10): the draw enters the state's federal-AGI stand-in before it is subtracted.
  CT (`heir`, `agiPhasedShare`; `stateRetirementExclusion` is called with `start` as its AGI): a draw that moves the AGI
  across a step of the share table changes the share applied to the household's own IRA draw as well as to the draw
  (hand-compute both shares). NY (`decedent`): the Empire State child credit reads `fedAgi` (`start`): $500 a child aged 4-16, less $16.50 per $1,000
  (or part) of federal AGI over $110,000 joint. A `taxFor`-level case (`stateOf`): MFJ, both 62, one child aged 10
  (`dependents: [{ age: 10, student: false, qualifyingChild: true }]`), `extraA` 100,000 (state wages), and a $20,000
  draw (`otherA` + 20,000, `inhOn: true, inheritedA: 20000, inheritedB: 0, inhExtraA: 0, inhExtraB: 0, inhExclA: 20000,
  inhExclB: 0`): `start` 120,000, cut ceil(10,000 /
  1,000) x 16.50 = 165, credit 335, while the whole $20,000 is excluded; the twin (no draw, `start` 100,000) keeps $500.
  Assert the inherited profile's NY tax - the twin's = 165.00 within $0.01. (Illinois's AGI-limited credit reads the state's AGI after its subtractions, so it cannot show this.)
- `afterTaxValue and estate`: the last row's `estate.traditional` includes the open inherited traditional balance (read the
  non-enumerable `estate` through the existing end-value hook used by `tests/end_value_us.js`). The `afterTaxValue` term
  (spec 6.8): add `afterTaxValue` to `window.__test_inherited`; on a `bal` literal with every field 0 except
  `inheritedTrad: 100000, inheritedRoth: 50000`, `afterTaxValue(bal, 0.2, 0.15)` = 100,000 x (1 - 0.2) + 50,000 =
  130,000 exactly, and with both inherited fields 0 it is 0 (and `Object.is` today's value for a legacy `bal` with
  `taxable: 1000, taxableBasis: 400, traditional: 2000, roth: 300, cash: 50`, plus `bondTaxable, bondTaxableBasis,
  bondTraditional, bondRoth, home` at 0 (today's function reads them; the first two literals carry them at 0 too): 1,000 - 600 x 0.15 + 2,000 x 0.8 + 300 + 50
  = 2,860).
- `cash conservation`: in a working surplus year (H with `incomeA: 150000`, `retireAgeA: 65`), total investable excluding
  the inherited balance at year end equals the twin run with a tax-free lump equal to the draw, less the tax difference,
  within $0.01; the inherited balance at year end equals start x 1.07 less the draw, exactly.
- `Roth payout swept at full basis` (spec 7): `H` with `incomeA: 150000, incomeB: 0, retireAgeA: 70, retireAgeB: 70`
  (working surplus years), `dividendYield: 0`, and a $100,000 `inheritedRoth` row of A's received at 58 (receiptYear -2,
  a 2024 death: a 10-year row; open now at $100,000; payout in year 8 = 100,000 x 1.07^9 = 183,845.92). Against the
  twin with no row: in year 8, (taxableBasis_8 - taxableBasis_7) - (twin's same) = 183,845.92 and (taxable - taxableBasis)
  equals the twin's, each within $0.01 (the payout reaches cash and the sweep moves it to taxable at full basis; no
  tax, no MAGI: `row.tax` and `row.magiProxy` equal the twin's within $0.01). Step 3.11 adds `taxable` and `taxableBasis`
  to the trace entry.

Federal cases (spec 7 "Federal"; TX; `stateOf` is not needed):
- `Social Security taxation`: `H` with `ageA: 67, ageB: 67, ssMonthlyA: 1500, ssMonthlyB: 1500, ssStartAgeA: 67,
  ssStartAgeB: 67` (the amount is used as-is from the start age; inflation 0: benefits 36,000), `dividendYield: 0`,
  `basisRatio: 100`, a not-earned stream for A of $20,000, and A's $200,000 row received at 66 (year 0 draw 214,000 / 10 =
  21,400). Assert first `profile.ssA + profile.ssB === 36000`. Hand (SS_BASE mfj [32,000, 44,000, 6,000]):
  - twin: provisional 20,000 + 18,000 = 38,000; taxable benefits 0.5 x (38,000 - 32,000) = 3,000;
  - inherited: provisional 20,000 + 21,400 + 18,000 = 59,400; taxable min(0.85 x 36,000 = 30,600, 0.85 x (59,400 -
    44,000) + 6,000 = 13,090 + 6,000 = 19,090) = 19,090;
  - deductions at 67, MFJ, 2026: standard 32,200 + 2 x 1,650 (65+) + senior 2 x 6,000 (MAGI far under the phase-out) =
    47,500 (confirm each figure in `STD_DEDUCTION`, `STD_EXTRA_65` and `seniorDeduction` and redo the sums if one
    differs); twin taxable income 20,000 + 3,000 - 47,500 < 0: 0; inherited 20,000 + 19,090 + 21,400 - 47,500 = 12,990,
    all in the 10% bracket: 1,299.00.
  Assert `row.tax` (federal only in TX) inherited - twin = 1,299.00 within $0.01 (both runs are surplus years with no dividends: no sale, no gain; `basisRatio` does not matter).
- `ACA premium at the realized MAGI`: the household of Task 5's `ACA at 61` case (both 61, `acaEnabled: true`,
  `returnRate: 0, dividendYield: 0, basisRatio: 100` (no growth before a sale, no dividends and no starting gain, so
  neither run realizes a gain; any one alone is not enough: the third plan review measured the twin at MAGI 80,425.14
  without `basisRatio: 100`, and at exactly 60,000.00, healthcare 5,678.47, need 38,518.47 with it), the $60,000
  stream, `spending: 90000`, `taxable: 600000`, `medicalInflation: 0`, A's $428,000 row received at 60: draw 428,000 /
  10 = 42,800). Year 0: `row.magiProxy` inherited - twin = 42,800 within $0.01 (twin 60,000, inherited 102,800; the 400%
  line for two is `fplForHousehold(2) x 4` = 84,600); `row.healthcare` 18,000.00 inherited (the full premium: no credit
  over 400%) and 5,678.47 twin (measured by the plan reviewer; the difference 12,321.53 is the spec's decision-16
  example), each within $0.01.
- `IRMAA two years on`: `H` with `ageA: 67, ageB: 67`, `medicalInflation: 0`, `dividendYield: 0`, `irmaaPriorKnown:
  true, irmaaMagiPrior2: 0, irmaaMagiPrior1: 0` (otherwise years 0 and 1 read year 0's own MAGI as the lookback), a
  not-earned stream for A of $200,000 (a surplus year: no sale), A's $400,000 row received at 66 (year 0 draw 42,800,
  year 1 45,796): Medicare MAGI 242,800 in year 0 against the twin's 200,000, across the first MFJ IRMAA line ($218,000
  for 2026). Years 0 and 1: `row.healthcare` equals the twin's within $0.01 (both read the entered prior MAGIs of 0);
  year 2: inherited - twin = 2 people x 12 months x 95.70 (the tier-1 monthly surcharge, Part B + Part D) = 2,296.80,
  within $0.01.
- `Roth fill converts less`: `H` with `rothConvEnabled: true` at the 12% bracket (read the bracket field's name),
  `tradIraA: 600000`, `dividendYield: 0`, A's $400,000 row received at 59 (year 0 draw 42,800). The bracket fill fills
  taxable income to the bracket top, so the draw takes its room dollar for dollar: twin's `trace[0].conversionAmount` -
  inherited's = 42,800 within $0.10 (assert both conversions > 0 first; `solveRothConversionTo` runs 24 halvings of a
  bracket of about 600,000, about $0.036 per run, so the difference of two runs can be off by up to about $0.07; the
  plan reviewer measured 42,800.009).
- `owner B on two returns`: `H` with `filingStatus: 'single'` (an unmarried couple: two returns every year),
  `dividendYield: 0` and, in both runs, `incomeSources: [{ amount: 70000, startAge: 50, endAge: 90, followGrowth: false,
  growth: 0, owner: 'A', kind: 'other' }]` (a surplus year: no sale, no gain; measured by the plan reviewer: `magiA`
  70,000 in both runs), B's $400,000 row received at 59 (heir B 60 in 2026, L = SLT[60] = 27.1; year 0
  draw max(428,000 / 10, 400,000 / 27.1 = 14,760.15) = 42,800). Year 0: `row.magiB` inherited - twin = 42,800 and
  `row.magiA` inherited = twin, each within $0.01; the trace's `profile.otherB` carries the draw.

Create `test_inherited_accounts.js` (model on `test_lump_income.js`): add a one-time income row, select each new kind:
the owner shows (couple), gain share and the NIIT box hide; a kind change from `free` to `inheritedTrad` changes
`window.fireProjectionRows` (a row gains `inheritedTrad`); the status cell's tooltip in an inherited year contains
"inherited"; the income-group summary says "inherited account planned" (no streams) and "/yr + inherited account" (with an
income stream of $10,000 added).

- [ ] **Step 2: Run them to verify they fail**

`node tests/inherited_accounts.js` -> FAIL (`inheritedDraw` undefined, ...).

- [ ] **Step 3: Implement**

1. Pure functions (spec 6.1, 6.2), below `lumpAmountsForYear`:

```js
  // E1e: one inherited row's draw (traditional) or payout (Roth) in draw year k (spec 6.2). b = start-of-year balance,
  // r = the year's stock return, L = the heir's Single Life factor in the year after receipt. A 10-year row: traditional
  // even over the years left with the RMD on L as a floor and the account as a cap; Roth whole in year 10. A stretch row
  // (death before 2020, decision 17): the RMD alone, both kinds. k < 1: nothing.
  function inheritedDraw(b, r, k, L, roth, stretch) {
    if (k < 1 || !(b > 0)) return 0;
    const grown = b * (1 + r);
    const d = L - k + 1;
    if (stretch) return d <= 1 ? grown : Math.min(grown, b / d);
    if (roth) return k >= 10 ? grown : 0;
    if (k >= 10 || d <= 1) return grown;
    return Math.min(grown, Math.max(grown / (11 - k), b / d));
  }
```

   `inheritedLedger(rows, ctx)`: for each row with `kind === 'inheritedTrad' || kind === 'inheritedRoth'` (raw rows read
   defensively: owner `'B'` only when `!ctx.single && row.owner === 'B'`), `receiptYear = Math.round(row.age) - ctx.ageA`,
   death year `ctx.currentYear + receiptYear`, `stretch = deathYear < 2020`; skip a 10-year row with `receiptYear + 10 < 0`;
   the heir slot at receipt = the named owner unless that owner is dead at receipt (`ctx.deathYear <= receiptYear` and
   `deceasedIsA` for owner A / `deceasedIsB` for owner B): then the other partner; `L = singleLifeFactor(heir age in year
   receiptYear + 1)` (heir age = `(slot A ? ctx.ageA : ctx.ageB) + receiptYear + 1`); `open = receiptYear < 0 ? 1 : 0`,
   `bal = receiptYear < 0 ? row.amount : 0` (a past row's amount is today's balance; `flat` has no effect). Store the
   amount for opening (`openAmount[i] = row.amount`, `flat[i] = row.flat === true`) for future rows. Sort the slots by
   `receiptYear` ascending (ties: list order). `owner[i]` keeps the named owner (0 = A, 1 = B); `heir[i]` is derived from
   it as above. Every array has length `n`, the number of kept rows (allocate them once here, after the skips). Return null
   when no inherited row exists or every inherited row is skipped. `deadline[i] = stretch ? Infinity : receiptYear + 10`.
   `inheritedYear(inh, ctx, out)` with `ctx = { year, stockReturn, deadA, deadB }`: reset `out` first (`drawA = drawB =
   rothPayout = 0`, `any = false`) and `inh.draw.fill(0)`. Then for each slot **that is open** (`inheritedYear` never opens a
   row; only `inheritedApply` does, Step 3.7):
   - the slot this year = `heir[i]`, moved to the other partner once that heir is dead (`ctx.deadA` / `ctx.deadB`);
   - a 10-year row (`!stretch[i]`, or a stretch row whose successor deadline is set): `k = ctx.year - receiptYear[i]` for a
     10-year row, `k = ctx.year - (deadline[i] - 10)` for a successor row; draw `inheritedDraw(bal[i], ctx.stockReturn, k,
     L[i], roth[i], false)`;
   - a stretch row with no successor deadline (`deadline[i] === Infinity`): draw `inheritedDraw(bal[i], ctx.stockReturn,
     ctx.year - receiptYear[i], L[i], roth[i], true)`; then, **after** that draw, if the row's heir is dead this year for
     the first time (the heir's `ctx.deadA` / `ctx.deadB` is true and the deadline is still Infinity), set `deadline[i] =
     ctx.year + 10` and `L[i] -= (ctx.year - receiptYear[i])`. Year Y (the first dead year) is therefore still a stretch
     year, and from Y + 1 the successor call `inheritedDraw(b, r, year - Y, L[i], roth, false)` gives `d = L[i] - (year -
     Y) + 1 = L - (year - receiptYear) + 1`: the heir's factor continued (spec 6.2). Test: Step 1 `stretch successor`.
   - add a traditional draw to `out.drawA` / `out.drawB` by the slot this year (pre-remap), a Roth payout to
     `out.rothPayout`; record `inh.draw[i]`. `out.any` is not set here: `inheritedApply` sets it (Step 3.7), after a receipt-year row has
     opened.
2. `runProjection`: right after `bal` is built, `const inh = inheritedLedger(state.oneTimeIncome, { ageA: state.ageA,
   ageB: state.ageB, single: singlePerson, currentYear, deathYear, deceasedIsA, deceasedIsB });` (move it below `deathYear`
   if needed). Add `inheritedTrad: 0, inheritedRoth: 0` to the `bal` literal (appended last); when `inh` has open past rows,
   set them after the literal (sum of open traditional / Roth balances).
3. Year loop, after `listAmountsForYear` and the lump locals: `let inhDraw = 0, inhDrawA = 0, inhDrawB = 0, inhRothPayout =
   0; if (inh !== null) { inheritedYear(inh, { year, stockReturn, deadA: deceasedIsA && year >= deathYear, deadB:
   deceasedIsB && year >= deathYear }, INH_OUT); inhDrawA = INH_OUT.drawA; inhDrawB = INH_OUT.drawB; inhDraw = inhDrawA +
   inhDrawB; inhRothPayout = INH_OUT.rothPayout; }` (the `ctx` is the same four fields as in the Interfaces; reuse one
   preallocated object for it, not a literal per year).
4. `buildTaxProfile` call: add `inhOn: inh !== null, inheritedA: inhDrawA, inheritedB: inhDrawB`. In `buildTaxProfile`:
   `otherA = profileWageA + pensionA + rmdA + streamOtherA + seNetA` gains `+ inheritedA` appended **only when
   `inheritedA > 0`** (write `let otherA = <today>; if (inheritedA > 0) otherA += inheritedA;`), same for B. Never touch
   `streamOtherA/B` (spec 6.3, S3). Both profile literals carry `inhOn`, `inheritedA` / `inheritedB` (the remap literal:
   `inheritedA: inheritedB, inheritedB: 0`), `inhExtraA: 0, inhExtraB: 0, inhExclA: 0, inhExclB: 0`.
5. The New York base exclusion (spec 6.4 M-1): when `inh !== null` and the year's compiled rule (`stateRuleFor(state.stateTax)`
   and its variant for the year; reuse the variant selection of `stateIncomeTax` through a small helper `stateRuleForYear(
   yearIndex)`) has `inhKind === INH_DECEDENT`, compute per POST-remap slot (in single-person mode and the survivor period
   every row is slot A) the sum of `Math.min(inh.draw[i], rule.inhCap)` over traditional rows; set `profile.inhExclA/B` to
   it right after `buildTaxProfile` and save it as the pass-top base (`inhExclBaseA/B`) for Task 6.
6. Cash flow: change `const flow = mode.bucketStrategy ? ... : ...;` to `let flow = <the same expression>;` followed by
   `if (inhDraw > 0) flow += inhDraw;` (appended after both strategies' sums, so a legacy year's double is unchanged; no
   other code reassigns `flow`). `totalIncome` needs nothing (the draw is in `otherA/B`).
7. Growth and draws, in the block with `growBalances` / `withdrawRequiredDistributions`: after `growBalances(...)`, when
   `inh !== null`: grow each open slot (`bal *= 1 + stockReturn`), subtract each slot's `inh.draw[i]` (traditional) or
   payout (Roth), close a slot whose balance reaches 0 at its deadline, then open this year's future rows, after growth
   and only here: `if (!open[i] && year === receiptYear[i]) { open[i] = 1; bal[i] = openAmount[i] * (flat[i] ? 1 :
   factor); }` (a row opened this year neither grows nor draws this year; `inheritedYear` skips rows that are not open),
   set `INH_OUT.any = true` when a slot is open at year end or was drawn or paid out this year (so the receipt year gets
   its row fields and tooltip, spec 6.8), re-sum `bal.inheritedTrad` / `bal.inheritedRoth`, and `bal.cash +=
   inhRothPayout` (before `sweepExcessCash`, beside `bal.cash += oneTimeAmount`). Write this as `inheritedApply(inh, bal,
   stockReturn, factor, year)` (a pure-ish helper beside the others).
8. Snapshot: beside `const acctSnapshot = accountsClone(accts);` add `const inhSnapshot = inh !== null ?
   inheritedClone(inh) : null;` and in the restore `if (inh !== null) inheritedRestore(inh, inhSnapshot);`
   (`inheritedClone` copies `bal`, `open`, `deadline`, `draw` into preallocated arrays; no allocation per year: allocate the
   snapshot arrays once per run inside the ledger).
9. Totals (spec 6.8), only when `inh !== null`: in the row build, `investable` adds `bal.inheritedTrad + bal.inheritedRoth`
   (appended), `row.traditional` / `row.roth` add their part, and the row carries `inheritedTrad`, `inheritedRoth`,
   `inheritedDraw: inhDraw` when any slot is open or paid out this year; `row.traditionalWithdrawn` adds `inhDraw` (the
   existing `wd.traditionalWithdrawn` starts at `rmd`; add the draw to the row's field only). `estate.traditional` /
   `estate.roth` add the inherited balances (two additions, skipped when both are 0). `afterTaxValue`: append
   `if (bal.inheritedTrad + bal.inheritedRoth > 0) v += bal.inheritedTrad * (1 - lambda) + bal.inheritedRoth;` (rewrite the
   return as `let v = <today>; ...; return v;`).
10. UI: `DYN.oneTimeIncome.fields`' `kind` options gain `['inheritedTrad', 'Inherited traditional IRA / 401(k)']`,
    `['inheritedRoth', 'Inherited Roth IRA / 401(k)']`; the owner field's `showIf` adds the two kinds; the `kind` tip gets
    spec 5.1's paragraph (copy it exactly, then add the pre-2020 sentence of decision 17 already in the spec); the list
    `note` / `tip` mention inherited accounts (this moves `ui_us.json` text hashes: Step 4). The income-group summary
    (~2467): with `hasInh` = any `oneTimeIncome` row of an inherited kind, the text is chosen in this order:
    `sourcesTotal > 0 && hasInh` -> `` `✓ ${compact(sourcesTotal)}/yr + inherited account` ``; `sourcesTotal > 0 &&
    oneTimeIncome.length > 0` -> today's `/yr + lump sum`; `sourcesTotal > 0` -> today's `/yr`; `hasInh` -> `'✓ inherited
    account planned'`; `oneTimeIncome.length > 0` -> today's `'✓ lump sum planned'`; else today's `'✓ stream added'`. (So
    an inherited row names itself whether or not streams exist, and every summary without one is today's text.) `annotateInheritedRows(rows)` (US-only, after the shared `renderTable` call, beside
    `annotateSolverRows`): for each displayed row with `inheritedTrad` or `inheritedRoth`, append "includes inherited
    traditional $X / Roth $Y" to the status cell's `title`.
11. Trace: each trace entry gains `inherited: inh === null ? null : Array.from(inh.bal)`, `taxable: bal.taxable` and
    `taxableBasis: bal.taxableBasis` (trace only; for the `Roth payout swept at full basis` case).

- [ ] **Step 4: Run the tests**

`node tests/inherited_accounts.js`, `node test_inherited_accounts.js`: PASS. `node tests/snapshot.js`: PASS (no existing
entry moves; no scenario added). `node tests/snapshot_ui.js`: FAIL on `ui_us.json` text hashes only (the one-time income
list `note` and `tip` sit inside `<main>`, whose `innerText` is hashed, ~262; E1d's `12d2970` moved three hashes for the
same reason). Confirm with a scratch diff that every changed key is a `textHash` / `textLength`, then `node
tests/snapshot_ui.js --update` and check the json diff has only those keys; list them in the commit message. Any other
`ui_us.json` change: stop and report. `npm test`: PASS. Mobile check (390x844): `scrollWidth > clientWidth` is false with
an inherited row open. Timing gate.

- [ ] **Step 5: Commit**

```bash
git add test_inherited_accounts.js
git commit -m "E1e Task 4: the inherited account (ledger, 10-year and stretch schedules, Roth transfer, the draw in flow and on the owner's federal and state returns, NY's base exclusion, totals, rows, estate, the two select options and their copy, the status tooltip); ui_us.json text hashes only (the one-time income list note and tip inside main); no existing number change, no scenario added" -- Planner_US.html tests/inherited_accounts.js test_inherited_accounts.js tests/snapshots/ui_us.json
```

---

### Task 5: The need readers: the guardrails, `firstWithdrawal` and lambda net of the draw's tax and premium (US)

**Files:**
- Modify: `Planner_US.html`: the year loop: after `const tax = taxFor(profile, 0, conversionAmount) + ficaTax;` (~10971),
  the deficit branch's record (~11043-11047), the surplus branch (`if (flow >= 0) {`, ~11028), the forced pass's record
  (~11238-11242), `guardrailPortfolioNow` (~11019), `lambdaOf`'s `lambdaNeed` (~10903).
- Modify: `tests/inherited_accounts.js`.

**Interfaces:**
- Consumes: Task 4's `inhDraw`, `inhDrawA/B`, `inh`, the profile fields; `costAt`'s machinery (`hcArgs`, `healthcareCost`).
- Produces: per pass `inhNeedAdj` (0 when `inhDraw === 0`), `hcNoDraw`, `taxNoDraw`; the trace entry's `guardrails` already
  exists (E1d); add `inhNeedAdj` to the trace entry.

- [ ] **Step 1: Write the failing tests**

```js
  // The recorded need equals the twin run's (no inherited row) in the same year (decisions 15, 16). The twin has the same
  // spending, other income and taxes apart from the draw; its portfolio differs, so compare the need, not the rate.
  const needOf = (e, y) => e.trace[y].guardrails.prevNeed;
  // The two ACA cases: returnRate 0, dividendYield 0 and basisRatio 100 (no growth before a sale, no dividends and no
  // starting gain, so neither run realizes a gain; any one alone is not enough), a not-earned stream for A of $60,000 and
  // spending $90,000, so the twin is in deficit at a MAGI of 60,000, under the 400% line for two (fplForHousehold(2) x 4 =
  // 84,600), and the inherited run is at 60,000 + 42,800 = 102,800, over it.
  const ACA = { acaEnabled: true, returnRate: 0, dividendYield: 0, basisRatio: 100, spending: 90000, medicalInflation: 0,
    incomeSources: [{ amount: 60000, startAge: 50, endAge: 90, followGrowth: false, growth: 0, owner: 'A', kind: 'other' }] };
  for (const [label, patch] of [['TX no ACA', {}], ['ACA at 61', { ...ACA, ageA: 61, ageB: 61 }], ['ACA at 64', { ...ACA, ageA: 64, ageB: 64 }]]) {
    const H2 = { ...H, ...patch, guardrailsEnabled: true, taxable: 600000 };
    // received at A's age - 1: k = 1 this year. TX (7%): max(428,000 x 1.07 / 10 = 45,796, 428,000 / SLT[60] 27.1 = 15,793.36)
    // = 45,796. ACA (0%): max(428,000 / 10 = 42,800, 428,000 / SLT[61] 26.2 = 16,335.88 or / SLT[64] 23.7 = 18,059.07) = 42,800.
    const a = await engine(H2, [R({ amount: 428000, age: H2.ageA - 1, owner: 'A' })]);
    const b = await engine(H2, []);
    console.log(label, 'MAGI', a.rows[0].magiProxy, b.rows[0].magiProxy, 'healthcare', a.rows[0].healthcare, b.rows[0].healthcare);
    if (patch.acaEnabled) assert(a.rows[0].healthcare - b.rows[0].healthcare > 10000, `${label}: the draw costs more than $10,000 of premium credit`);
    near(needOf(a, 0), needOf(b, 0), 0.05, `${label}: recorded need without the inheritance`);
  }
  // TX no ACA, by hand (MFJ, the code's 2026 figures; worked by the plan reviewers): tax with the draw 10% x (45,796 + 900
  // ordinary dividends - 32,200) = 1,449.60, taxNoDraw 0, so inhNeedAdj = 45,796 - 1,449.60 = 44,346.40; H keeps its $18,000
  // flat premium, so flow = 45,796 - 40,000 - 18,000 - 1,449.60 = -13,653.60 (a deficit year); recorded 13,653.60 +
  // 44,346.40 = 58,000.00 = the twin's (measured 58,000).
  // ACA at 61 (measured by the plan reviewer with a stream standing in for the draw): twin premium 5,678.47, inherited
  // 18,000; recorded 13,176 + (42,800 - (7,976 - 2,840) - (18,000 - 5,678.47)) = 38,518.47 = the twin's 38,518.47.
```

(Write the two printed MAGIs and premiums in a comment of the committed test.)

Also:
- `year 10 portfolio` (spec 6.7 example): `H` with `taxable: 1500000`, `spending: 60000`, `guardrailsEnabled: true`,
  `dividendYield: 0`, `basisRatio: 100` (so neither run pays a tax that depends on its own larger or smaller taxable
  account), and A's traditional row of $1,530,000 received in year 0 (row age 60): draw year 10 = projection year 10,
  where the draw is the whole account, 1,530,000 x 1.07^10 / 10 = 1,530,000 x 1.967151 / 10 = 300,974.16. Years 1-9 are
  draw-made surplus years against a larger portfolio, so the multipliers of the two runs may differ before year 10 and
  are not compared, and neither are the needs: the two runs' spending multipliers diverge before year 10 (the plan
  reviewer measured 1.1 for the twin, about 1.4641 for a household at the inherited run's portfolio), and the inherited
  run's year-10 healthcare carries IRMAA from year 8's MAGI (the draws are 153,000 x 1.07^k; year 8's is 262,882, so the MAGI is 264,082.49, measured by the fourth plan review with a 7%-growing stream standing in for the draws: tier 1,
  95.70 x 12 x 2 = 2,296.80), which
  decision 16 leaves in the need on purpose. Assert in year 10: `guardrails.prevNeed` equals the inherited run's own
  `row.expenses` within $0.05 (with ACA off `hcNoDraw = healthcare`, and the tax without the draw is 0: the only other
  income is about $1,200 of cash-reserve interest, under the standard deduction; so the recorded need is `-flow +
  inhNeedAdj = expenses`), and `guardrails.prevPortfolio`
  equals `gpBase + row.inheritedTrad + row.inheritedRoth + row.inheritedDraw` within $0.01 (`gpBase` = the trace's
  household-only `guardrailPortfolioNow`, Step 3; `row.inheritedTrad` is 0 after the year-10 draw, so this is the
  household portfolio plus the inherited balance before the draw). In year 11: `guardrails.multiplier` is not below year
  10's (no capital-preservation cut from a portfolio that dropped by the draw). No twin run in this case. If the
  recorded need differs from `row.expenses` by a tax, print both and report it; do not loosen the test.
- `draw-made surplus`: a working-free year where the scheduled draw exceeds the need: a record exists (twin: a deficit year
  with the same need) and equals the twin's.
- `lump year`: a taxable lump in the same year as a scheduled draw: nothing recorded (E1d decision 7).
- `firstWithdrawal`: retirement year with a draw: equals the twin's.
- `lambda`: `window.__test_planTrace()`'s `lambdaNeed` in a draw year equals the twin's (cliff plan on, a household with a
  candidate in reach; if no candidate, assert through the trace's `inhNeedAdj` + `-flow` instead and say so).
- `exact restore`: in a draw year, EVERY key of the trace's `profile` is `Object.is` the same as in a run with the step
  disabled through the test-only switch `window.__test_inhNoNeedAdj(true)` (reset it in `finally`; guardrails off, so
  the two runs' draws and balances are the same; iterate over the union of both profiles' keys). Comparing `otherA` alone cannot catch a bad restore (the
  draws are whole dollars, so `(oA - iA) + iA` is exact) and misses a field that is never restored. Use a draw with
  cents (a row whose year-1 draw is not a whole number, e.g. $123,456.78 received at A's age - 1) and a profile with
  `inhExclA` set (NY).
- `call counter`: a module-level `let inhNoDrawCalls = 0`, incremented once inside the `inhDraw > 0` block (Step 3), read
  and reset through `window.__test_inhNoDrawCalls = (reset) => { const n = inhNoDrawCalls; if (reset) inhNoDrawCalls = 0;
  return n; }`; call it with `true` before each run. It is 0 for a legacy household over a whole run, and above 0 for a run with a
  scheduled draw (spec 7: the extra `taxFor` and `healthcareCost` run only in a year with a scheduled draw).

- [ ] **Step 2: Run them to verify they fail**

Each recorded need differs from the twin's by the draw (Task 4 records `-flow`).

- [ ] **Step 3: Implement** (spec 6.7)

At the pass top (beside the other per-pass resets, before `lambdaOf` is defined, because `lambdaOf` reads it): `let
inhNeedAdj = 0;`. After `const tax = ...` (once per pass; skip entirely when `inhDraw === 0`), the block ASSIGNS it (no
second declaration: a second `let` in the same scope is a SyntaxError):

```js
        // E1e decisions 15, 16 (spec 6.7): the need as if the inheritance were not there: the scheduled draw net of its own tax
        // and of the premium credit it costs this year. One taxFor and one healthcareCost per pass, only in a draw year.
        // (inhNeedAdj is declared at the pass top.)
        if (inhDraw > 0 && !testInhNoNeedAdj) {
          const oA = profile.otherA, oB = profile.otherB, iA = profile.inheritedA, iB = profile.inheritedB,
            on = profile.inhOn, eA = profile.inhExclA, eB = profile.inhExclB, med = profile.medicalExpense;
          // the premium at the pass's MAGI less the draw (each return less its own share in a two-return year)
          hcArgs.magiProxy = magiProxy - inhDraw;
          if (twoReturns) { hcArgs.magiA = magiA - iA; hcArgs.magiB = magiB - iB; }
          const hcNoDraw = healthcareCost(hcArgs).healthcare;
          hcArgs.magiProxy = magiProxy; hcArgs.magiA = magiA; hcArgs.magiB = magiB;
          profile.otherA = oA - iA; profile.otherB = oB - iB;
          profile.inheritedA = 0; profile.inheritedB = 0; profile.inhOn = false; profile.inhExclA = 0; profile.inhExclB = 0;
          profile.medicalExpense = seLive ? hcNoDraw + ltc - (seRealA + seRealB) : hcNoDraw + ltc;
          const taxNoDraw = taxFor(profile, 0, conversionAmount) + ficaTax;
          // restore from the saved doubles, never by adding the draw back ((x - d) + d !== x)
          profile.otherA = oA; profile.otherB = oB; profile.inheritedA = iA; profile.inheritedB = iB; profile.inhOn = on;
          profile.inhExclA = eA; profile.inhExclB = eB; profile.medicalExpense = med;
          inhNeedAdj = inhDraw - (tax - taxNoDraw) - (healthcare - hcNoDraw);
        }
```

(`inheritedA/B` on the profile are post-remap, the same slots as `otherA/B`; `magiA/B` are the pass's two-return MAGIs; `ltc`,
`seRealA/B`, `seLive` are the pass's own. Place the block after `healthcare`, `ltc`, `seRealA/B` and `profile.medicalExpense`
are final for the pass and after `ficaTax`.) Then:
- `lambdaNeed` (in `lambdaOf`): `Math.max(0, (lumpYear ? -flow - lumpExpense + lumpFlow : -flow - lumpExpense) + inhNeedAdj)`
  written so a legacy year computes today's expression exactly: `inhNeedAdj !== 0 ? <expr> + inhNeedAdj : <expr>`, the
  same gate as the guardrail records (`inhNeedAdj` can be negative: a draw that crosses the 400% line costs more premium
  credit than it nets, e.g. a $1,000 draw that loses about $12,000 of credit). `lambdaOf` is a closure defined inside the
  pass (~10896) and called after the block in the same pass (~11294, ~11329), so it reads the pass's value through the
  pass-top declaration.
- Deficit branch: `recordGuardrailWithdrawal(guardrails, Math.max(0, wd.need - lumpExpense), ...)` and the
  `firstWithdrawal` line use `wd.need - lumpExpense + inhNeedAdj` when `inhNeedAdj !== 0` (ternary on the flag, today's
  expression otherwise). Same in the forced pass (`needNet - lumpExpense + inhNeedAdj`).
- Surplus branch (`flow >= 0`): when `!lumpYear && inhNeedAdj > 0 && -flow + inhNeedAdj > 0`: `const n = Math.max(0, -flow -
  lumpExpense + inhNeedAdj); if (!working && year === retirementYear) firstWithdrawal = n; recordGuardrailWithdrawal(guardrails,
  n, guardrailPortfolioNow, working);`.
- `guardrailPortfolioNow`: when `inh !== null`, `+ bal.inheritedTrad + bal.inheritedRoth + inhDraw` appended (the portfolio
  before the draw; spec 6.7 S9).
- Trace entry: `inhNeedAdj` and `gpBase` (the household-only `guardrailPortfolioNow` before the inherited terms; trace
  only, for the `year 10 portfolio` case).
- Test-only flag: a module-level `let testInhNoNeedAdj = false;` set by `window.__test_inhNoNeedAdj = (on) => {
  testInhNoNeedAdj = !!on; }` (for the `exact restore` case only); the block's gate reads `!testInhNoNeedAdj`, not a
  `window` property.

- [ ] **Step 4: Run the tests**

`node tests/inherited_accounts.js`, `node tests/lump_income.js`, `node tests/snapshot.js`, `npm test`: PASS. Timing gate.

- [ ] **Step 5: Commit**

```bash
git commit -m "E1e Task 5: the guardrails, firstWithdrawal and lambda record the need with the scheduled inherited draw added back net of its own tax and premium (decisions 15, 16), a draw-made surplus year records, the guardrail portfolio before the draw (spec 6.7); no existing number change" -- Planner_US.html tests/inherited_accounts.js
```

---

### Task 6: The last resort and the fourth MAGI estimate (US; no existing number change)

**Files:**
- Modify: `Planner_US.html`: `newWithdrawal` (~9717: `wd.inh`, `wd.inheritedGrossA/B`, `wd.inhPost, wd.inhExclBase, wd.inhRule`), a new
  `takeInherited(wd)` beside `takePenalized`; `withdrawStandard` (~10007-10040); `BUCKET_STEP.home` and
  `BUCKET_STEP.penalized` (~10065-10083, US-only, outside the shared region); `returnMagis` (~7340); the year loop's MAGI
  iteration (pass top ~10755-10765, `preMagiA/B` ~10781, `costAt` ~10842, `irmaaAt` ~10870, the pass premium ~10922, the
  `estUsed` lines, the fill check ~11059, `totalIncome` ~11063, the drift / damped update ~11084-11095, `passLog`, the
  162(l) search and hold ~11102-11186, the pick restore / forced pass ~11190-11240, `realizedMagi` ~11246, `naturalRec` and
  trial records ~11280-11370, `prevInhA/B` beside `prevSeHealthA/B` ~11384, the post-convergence `returnMagis` ~11394).
- Modify: `tests/inherited_accounts.js`.

**Interfaces:**
- Consumes: Tasks 2 (`inhExtraA/B` in `taxFor`), 4 (the ledger, `inh.draw`, `profile.inhExclA/B` base), 5.
- Produces: `takeInherited(wd)` (returns nothing; reduces `wd.need`, adds to `wd.inheritedGrossA/B`, `wd.rothWithdrawn`,
  `wd.traditionalWithdrawn`, and the profile fields); `estInhA/B`, `prevInhA/B`, `inhRealA/B`; `returnMagis(profile, trad,
  gain, ia = 0, ib = 0)`; `costAt(trad, gain, sa, sb, ia = estInhA, ib = estInhB)`; `irmaaAt(trad, gain, ia = estInhA, ib =
  estInhB)`.

- [ ] **Step 1: Write the failing tests**

Engine cases in `tests/inherited_accounts.js` (spec 7; the identity test compares tax, `healthcare`, `magiA/magiB` and end
balances, tolerance $0.05 for money, stated in the test):
- `last resort basic`: a household that runs out in year 5 with a $300,000 inherited traditional row received 2 years
  earlier: in its depletion year the run draws inherited Roth (when present), then traditional, before home equity
  (`tenure: 'own'` with equity: equity untouched while inherited money remains); `depletedAge` later than the twin without
  the row; the next year's scheduled draw is smaller than the twin schedule without the last resort.
- `identity, one pass`: the tax of a year with a last-resort draw x equals the tax of the same year where the scheduled draw
  is x larger. x is read from the trace (`inhLastResortA/B`, the realized last-resort gross per POST-remap slot, Step 3.7);
  the second run uses the test-only hook `window.__test_inhForceExtra(year, slot, x)` (Step 3.7), defined precisely: in
  projection year `year`, right after `inheritedYear`, it adds x to ledger slot `slot`'s `inh.draw[slot]` and to the
  matching `INH_OUT.drawA` or `INH_OUT.drawB` (the slot's pre-remap owner this year), and under `INH_DECEDENT` the
  base exclusion of Task 4, Step 3.5 follows from the raised `inh.draw[slot]` (it is computed from it); balances are reduced by
  the raised draw in `inheritedApply` as for any draw. `__test_inhForceExtra(null)` clears it. Compare tax, `healthcare`,
  `magiA/B` and the end balances; tolerance $0.05.
- `identity, ACA multi-pass`: the same in an ACA household whose MAGI iteration takes 3+ passes in that year (add a
  test-only `passes: iter + 1` field to the trace entry; assert > 1).
- `identity, two returns`: an unmarried couple (`filingStatus: 'single'`), B's row, conversions on with a finite ceiling:
  the draw lands on B's return (`row.magiB` rises by x, `row.magiA` unchanged).
- `survivor last resort A dies` / `B dies`: A dies at 63, A's row; a last-resort draw in year 5: taxed (identity), on slot A.
- `receipt-year last resort`: a row received this year (no scheduled draw) drawn as a last resort this year: taxed (identity).
- `single-person`: the same in single-person mode.
- `forced pass`: an ACA household at a step-down cliff (copy the forced-pass household of `tests/aca_medicaid.js`) with a
  last-resort draw: `magiStats.forced` rises and the year's `tax` includes the draw's tax.
- `early Roth`: an heir of 50 drawing an inherited Roth as a last resort: no tax, no penalty (`row.earlyPenalty` 0).
- `penalty-aware`: an heir of 50 with penalized traditional money and an inherited traditional row: the inherited row is
  drawn before the penalized money (no penalty that year while inherited money remains); `takePenalized` probes see the
  draw (the year's tax equals the identity run's).
- `placements`: one case per path, each reaching the step: `withdrawStandard` plain, `withdrawStandard` penalty-aware,
  bucket `home` (an up year), bucket `penalized` (a down year with penalized money): in each the inherited money is drawn
  before home equity / penalized money and after the release of capped traditional money (cliff plan on with a stay-under
  in that year).
- `NY room`: NY, two traditional rows (two decedents). Row 1 has a $30,000 scheduled draw this year (its $20,000 already
  used: room 0); row 2 has a $5,000 scheduled draw (room 20,000 - 5,000 = 15,000). A last-resort draw of $10,000 comes from
  row 1 (oldest receipt first) if row 1 is older: no extra exclusion; build the case with row 2 older instead so the $10,000
  comes from row 2: $10,000 more excluded (the state tax rises by nothing for it). Assert both orders.
- `estate last resort`: the final projection year with a last-resort draw: `estate` reflects the reduced inherited balance.
- `legacy`: `node tests/snapshot.js` unchanged; a test-only counter of `takeInherited` calls that get past the `wd.inh ===
  null` gate is 0 for a legacy run (the function is called in every deficit year, so counting entries would not be 0;
  increment the counter right after the gate).

- [ ] **Step 2: Run them to verify they fail**

The step does not exist: inherited money is never drawn before home equity; depletion comes at the twin's age.

- [ ] **Step 3: Implement** (spec 6.5, 6.6)

1. `returnMagis(profile, trad, gain, ia = 0, ib = 0)`: add `ia` to A's return and `ib` to B's, appended only when non-zero.
2. `newWithdrawal(..., inh = null)`: a default of `null`, because `newTestWithdrawal` (~17233) calls `newWithdrawal`
   without it and `tests/solver_primitives.js` drives `withdrawStandard` with that object (`undefined !== null` would pass
   the gate and crash). `wd.inh` (the ledger or null), `wd.inheritedGrossA = 0`, `wd.inheritedGrossB = 0`; only when `inh
   !== null`: `wd.inhPost` (the ledger's preallocated array mapping each slot to its post-remap profile slot this year: 0
   in single-person mode and the survivor period, else the row's current slot), `wd.inhExclBase` (Task 4's base per
   slot) and `wd.inhRule` (`inhKind`, `inhCap`); otherwise all three are `null` (no per-pass allocation in a legacy run).
3. `takeInherited(wd)`: if `wd.inh === null` return; increment the test-only counter (the `legacy` case); if `wd.need <=
   0` return. Roth slots first (oldest receipt first): take
   `Math.min(need, bal)`, cash only (`wd.rothWithdrawn += x`, `wd.need -= x`, reduce the slot balance and
   `bal.inheritedRoth`). Then traditional slots: for slot S = `wd.inhPost[i]`, bisect the gross x such that the net (x less
   the tax increase) covers the need, probing `taxFor(wd.profile, wd.taxableGainGross, wd.traditionalGross)` with
   `profile.inhExtraS` = (what earlier calls already set) + x and, under `INH_DECEDENT`, `profile.inhExclS` = base + earlier
   room used + `Math.min(x, room)` where `room = Math.max(0, inhCap - inh.draw[i] - inh.lastResort[i])`; after the
   bisection leave the profile fields at the realized values (they persist for the pass; spec 6.6), add x to
   `wd.inheritedGrossS`, `wd.traditionalWithdrawn` and `inh.lastResort[i]`, reduce the slot balance and
   `bal.inheritedTrad`. The bisection (as `solveTraditionalForNet`, ~7840, never penalized): `baseTax` computed once with
   the current `inhExtraS` (and `inhExclS`); `lo = 0`, `hi = Math.min(slot balance, 6 * wd.need + 1)`; 24 iterations, each
   setting the probe's `inhExtraS` / `inhExclS` and comparing `x - (taxFor(...) - baseTax)` with `wd.need`; take `hi`; then
   the net at that final x (one more `taxFor` with the fields at x), and `wd.need -= net`, clamped at 0. (24 halvings of a
   bracket of about 6 x the need land within about $0.02 of the exact draw at a $50,000 need, inside the identity test's
   $0.05.) No `need * 3 + 1` widening and no other iteration count.
4. Placement (no shared edit):
   - `withdrawStandard`: in the penalty-aware branch, after `takeRoth(wd, 'bondRoth', ...)` and `releaseMagiCap(wd,
     solveTraditionalForNet);` insert `takeInherited(wd);` before `takePenalized(...)`; in the plain branch, after its
     `releaseMagiCap(...)`, insert `takeInherited(wd);`; the final `if (wd.need > 0) wd.need -= takeHomeEquity(...)` stays
     last.
   - `BUCKET_STEP.home`: `releaseMagiCap(wd, solveTraditionalForNetFromNeed); takeInherited(wd); if (wd.need > 0) wd.need -=
     takeHomeEquity(wd, wd.need);`.
   - `BUCKET_STEP.penalized`: `releaseMagiCap(...); takeInherited(wd); if (wd.need > 0) takePenalized(...);`.
5. The fourth estimate (spec 6.5), mirroring every `estSeA/B` site:
   - declarations beside `prevSeHealthA/B`: `let prevInhA = 0, prevInhB = 0;`; in the year body beside `estSeA/B`:
     `estInhA = prevInhA, estInhB = prevInhB` (only meaningful when `inh !== null`; otherwise 0 and every term skipped).
   - pass top: when `inh !== null`, `inh.lastResort.fill(0)` (it is not in `inheritedClone`: it is rebuilt each pass, so
     pass 0 of a year never reads last year's draws into the New York room); reset `profile.inhExtraA/B = 0`,
     `profile.inhExclA/B = inhExclBaseA/B` beside `profile.ownerShareA =
     ownerShareA0`; `magiBase = (seLive ? magiBase0 - estSeA - estSeB : magiBase0)` then `if (inh !== null) magiBase +=
     estInhA + estInhB;`.
   - `preMagiA/B` (~10781): `returnMagis(profile, estTrad, estGain, estInhA, estInhB)`; the pass premium's `returnMagis`
     (~10922) likewise.
   - `costAt(trad, gain, sa = estSeA, sb = estSeB, ia = estInhA, ib = estInhB)`: `hcArgs.magiProxy = magiBase0 - sa - sb +
     trad + gain` then `if (inh !== null) hcArgs.magiProxy += ia + ib;`; its `returnMagis(profile, trad, gain, ia, ib)`.
   - `irmaaAt(trad, gain, ia = estInhA, ib = estInhB)`: two-return `returnMagis(profile, trad, gain, ia, ib)`; single-return
     `magiBase + trad + gain` becomes `magiBase - estInhA - estInhB + ia + ib + trad + gain` when `inh !== null` (today's
     expression otherwise).
   - `estUsed`: beside E1c's line (~10966), `if (inh !== null && (estInhA !== 0 || estInhB !== 0 || wd.inheritedGrossA !== 0
     || wd.inheritedGrossB !== 0)) estUsed = true;` (place it where `wd` exists, after the withdrawal).
   - the realized pair: declare `const inhRealA = wd.inheritedGrossA, inhRealB = wd.inheritedGrossB;` right after the
     `const { traditionalGross, ... } = wd` line (~11082; 0 when no withdrawal). The fill check (~11059) and the deficit
     branch's `totalIncome` (~11063) run BEFORE that line, so they read `wd.inheritedGrossA/B` directly (reading
     `inhRealA` there would be a ReferenceError in an inherited run with a fill plan). The drift
     adds `Math.abs(inhRealA - estInhA) + Math.abs(inhRealB - estInhB)` when `inh !== null`; the damped update moves
     `estInhA/B` with the same weight `w`; `passLog` entries carry `estInhA, estInhB` and their `realized` cost uses
     `costAt(traditionalGross, taxableGainGross, seRealA, seRealB, inhRealA, inhRealB)`; the forced pass's `costAt` and
     `taxAfter` (the profile fields already hold the realized draw); the fill check (~11067), today `const m = magiBase +
     wd.traditionalGross + wd.taxableGainGross;`, becomes `magiBase - estInhA - estInhB + wd.inheritedGrossA +
     wd.inheritedGrossB + wd.traditionalGross + wd.taxableGainGross` when `inh !== null` (every term read through `wd.`:
     the bare `traditionalGross` / `taxableGainGross` are the `const`s destructured at ~11082, still in their temporal
     dead zone here); `totalIncome` adds `wd.inheritedGrossA +
     wd.inheritedGrossB` (appended, when non-zero);
     `realizedMagi` adds them (appended, when `inh !== null`).
   - records: every `passLog` entry, `naturalRec` (both literals) and `trialRecs.push({...})` carry `estInhA, estInhB` and the
     realized `inhA: inhRealA, inhB: inhRealB`; every restore that sets `estSeA/B` from a record sets `estInhA/B` from it (the
     pick restore ~11198, the 162(l) hold ~11181 `estInhA = inhRealA; estInhB = inhRealB;` beside `estTrad = realizedTrad`,
     the apply fallback replay ~11314, the winner replay ~11346, the trial seed ~11363 from `naturalRec.inhA/inhB`); the
     `naturalRec` and trial `irmaaAt` / `cliffCost` calls pass the realized pair; `seSearch`'s `costAt` calls pass the
     realized inherited pair.
   - after convergence: `prevInhA = naturalRec ? naturalRec.inhA : inhRealA` (and B), beside `prevSeHealthA/B`; the
     post-convergence `returnMagis(profile, traditionalGross, taxableGainGross, inhRealA, inhRealB)` (~11394).
   - `prevDiscTraditional` / `realizedTrad` unchanged (they exclude the inherited draw).
6. Rows: `row.traditionalWithdrawn` and `row.rothWithdrawn` already include the step's additions through `wd`.
7. Test hooks and trace: the trace entry gains `inhLastResortA: inhRealA, inhLastResortB: inhRealB` (the realized
   last-resort traditional gross per post-remap slot) and `passes: iter + 1`; `window.__test_inhForceExtra(year, slot, x)`
   (test-only, a module-level `{ year, slot, x }` or null, read right after `inheritedYear` only when `inh !== null`) as
   defined in Step 1 (`identity, one pass`); `window.__test_inhTakeCount()` returns the `takeInherited` counter.

- [ ] **Step 4: Run the tests**

`node tests/inherited_accounts.js`, `node tests/aca_magi_iteration.js`, `node tests/se_health.js`, `node tests/cliff_plan.js`,
`node tests/snapshot.js`, `npm test`: PASS. `node tests/plan_off_anchor.js --base ../fp-e1e-base`: PASS. Timing gate.

- [ ] **Step 5: Commit**

```bash
git commit -m "E1e Task 6: the last resort (inherited Roth then traditional, after the cap release, before penalized money and home equity, inside the US-only steps; taxed like a scheduled draw on the post-remap slot) and the fourth MAGI estimate estInhA/B on E1c's pattern (spec 6.5, 6.6); no existing number change" -- Planner_US.html tests/inherited_accounts.js
```

---

### Task 6b: The Roth bracket fill sees the last-resort estimate (spec decision 18; US; no existing number change)

Added 2026-10-10 after Task 6 (`0a37cea`): the implementer found that the fill sees the scheduled draw and the 162(l)
estimate but not the fourth estimate. One commit before Task 7.

**Files:**
- Modify: `Planner_US.html`: `buildTaxProfile`'s two profile literals (and the survivor remap literal), the pass-top block
  added in Task 6 Step 3.5 (`if (inh !== null) { inh.lastResort.fill(0); ... }`), `solveRothConversionTo`'s `ordinaryAt`
  (~7584, both branches).
- Modify: `tests/inherited_accounts.js`.

- [ ] **Step 1: Write the failing test.** `fill sees the last resort`: the household of Task 6's `identity, two returns`
  case (conversions on), and the same household joint (MFJ) so both `ordinaryAt` branches are reached. For each: a run
  where year y has a last-resort draw x (read x from the trace's `inhLastResortA/B`) against the run with
  `__test_inhForceExtra(y, slot, x)` and no last resort. Assert `trace[y].conversionAmount` equal within $1
  (`MAGI_ITER_TOL` = 1: the estimate converges to the realized draw within it) and that, before the fix, the last-resort
  run converted more (the red run shows the gap; Task 6's report measured 23,700 against 0). Then reinstate Task 6's
  identity comparison for the two-return case with conversions on: tax, `healthcare`, `magiA/B` and the end balances
  within $1 (the conversion now matches within `MAGI_ITER_TOL`, so the $0.05 identity tolerance does not apply to this
  case; say so in the test).
- [ ] **Step 2: Run it red** against `0a37cea`.
- [ ] **Step 3: Implement.**
  1. Both `buildTaxProfile` literals and the survivor remap literal carry `inhEstA: 0, inhEstB: 0`.
  2. In Task 6's pass-top block (only when `inh !== null`), beside `profile.inhExtraA = 0`: `profile.inhEstA = estInhA;
     profile.inhEstB = estInhB;` (post-remap slots, as `estInhA/B`).
  3. `ordinaryAt`, both branches: `const other = <today's expression>` becomes `let other = <today's expression>; if
     (profile.inhEstA || profile.inhEstB) other += (profile.inhEstA || 0) + (profile.inhEstB || 0);` before
     `taxableSS` is computed (profiles built elsewhere, the lambda samples and the optimizer, carry no such field and
     read as 0).
  4. Nothing else reads `inhEstA/B`.
- [ ] **Step 4: Run.** `node tests/inherited_accounts.js`, `node tests/snapshot.js` (exact), `node tests/plan_off_anchor.js
  --base ../fp-e1e-base`, `node tests/tax_caches.js`, `npm test`, `npm run check:shared`; timing gate (three runs).
- [ ] **Step 5: Commit**

```bash
git commit -m "E1e Task 6b: the Roth bracket fill sees the last-resort estimate (spec decision 18): profile.inhEstA/B set at the pass top, added to the fill's other income only when non-zero; the two-return identity case with conversions on reinstated; no existing number change" -- Planner_US.html tests/inherited_accounts.js
```

---

### Task 7: Snapshot scenarios, docs, version badge, timing record

**Files:**
- Modify: `tests/snapshot_scenarios.js` (new US scenarios), `tests/snapshots/us.json` (added entries only), `README.md`,
  `CLAUDE.md`, `docs/next-batches-plan.md` (the E1e implementation notes, after the E1e design record), `Planner_US.html`
  (the version badge V126 -> V127; the Methodology callout sentence on one-time income gains inherited accounts),
  `tests/snapshots/ui_us.json` (text hashes only, if the Methodology sentence changes).

- [ ] **Step 0: Tests only, one commit before the scenarios** (owner, 2026-10-10, after Task 6b; no `Planner_US.html`
  change):
  - `fill convergence bound` (decision 18's limitation): the joint fill household of Task 6b with a large last-resort
    draw (x at least $25,000, for example by raising spending; state x in the comment). Assert that the last-resort run
    reaches the pass cap (`trace[y].passes` = 8) and that its conversion is below the forced-scheduled-draw twin's by
    more than $0 and less than 0.1% of x. In the existing joint `fill sees the last resort` case, say in the comment
    that its draw is kept small on purpose (it converges within `MAGI_ITER_TOL`).
  - The receipt-year slot fix (`b816cc9`) in its untested branches, both in the survivor period: A's row received after
    A has died (the heir at receipt is B; the last-resort draw lands on post-remap slot A, `profile.inhExtraA`, the
    survivor's one-person return) and B's row received after B has died (heir A; slot A). Each with a hand relation
    (the draw in `profile.inhExtraA`, nothing in `inhExtraB`) and a tax identity against a forced scheduled draw.
  - Commit: `tests/inherited_accounts.js` only, message "E1e: tests for the fill convergence bound (decision 18
    limitation) and the receipt-year slot fix in the survivor period".
- [ ] **Step 1: Add the scenarios** (read `tests/snapshot_scenarios.js` for the US scenario format; base each on an
  existing standard scenario):
  - `R inherited trad future` (B's $400,000 row received at A's age + 2), `R inherited trad past` (received 3 years ago),
    `R inherited roth`, `R inherited two returns` (an unmarried couple, owner B), `R inherited last resort` (depletes with
    inherited money left), `R inherited stretch 2018`, `R inherited NY`, and one historical path (`real1966`) of
    `R inherited trad future`.
- [ ] **Step 2: Run** `node tests/snapshot.js` (FAIL: new scenarios unknown), then `npm run snapshot:update`; the
  `us.json` diff shows added entries only (check with `git diff --stat` and by searching the diff for a `-` line inside an
  existing entry: none).
- [ ] **Step 3: Docs.** README feature list: inherited IRA / 401(k) (traditional and Roth, the 10-year rule with the RMD
  floor, pre-2020 stretch, last resort, state treatment per state). CLAUDE.md: one paragraph after the E1d paragraph of
  "Add-as-you-go lists" (the ledger and its null gate, `inheritedDraw`, the stretch and successor rule, the Roth transfer,
  the draw in `otherA/B` never `extraA/B`, the five state kinds and the always-written sources fields, the fourth
  estimate (and `inhEstA/B`, which the Roth fill reads: decision 18, with its convergence limitation), the last resort inside `BUCKET_STEP.home` / `.penalized`, decisions 15-16's need, tests). The E1e notes in
  `docs/next-batches-plan.md`: commits, red-then-green records, the timing tables of Tasks 2, 4, 5, 6 and this task, the
  UI hash changes, anything the owner must decide.
- [ ] **Step 4: Badge and Methodology**: V127; the one-time income sentence of the Methodology callout adds "or an
  inherited traditional or Roth IRA / 401(k), drawn on the 10-year rule (a death before 2020: over the heir's life
  expectancy)". Run `node tests/snapshot_ui.js`; if it fails on text hashes only, `--update` and check the diff.
- [ ] **Step 5: Timing gate** (three runs) and `npm test`; then commit:

```bash
git commit -m "E1e Task 7: snapshot scenarios (us.json: added entries only), README, CLAUDE.md, the E1e notes, V127, the Methodology sentence (ui_us.json text hashes), timing record" -- tests/snapshot_scenarios.js tests/snapshots/us.json README.md CLAUDE.md docs/next-batches-plan.md Planner_US.html tests/snapshots/ui_us.json
```
