# E3: IRMAA appeal for a life-changing event (form SSA-44; US) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge Medicare IRMAA the way SSA does after a life-changing event: the lookback reads the filing status of the
return it uses (a survivor's first two years after a death are on the joint tiers), and after a retirement, the end of a W-2
or self-employed job, or a married spouse's death inside the plan, the household is assumed to appeal (form SSA-44), so
premium years E and E+1 are charged at the lowest of the normal lookback, year E's MAGI and (in E+1) year E+1's MAGI.

**Architecture:** A per-run event table (`irmaaAppealTable`, `null` for most runs: the default household gets none) records
each person's usable events by first post-event year. `healthcareCost` reads it: for a partner on Medicare whose window is
open and whose normal charge is above 0, it prices this year's MAGI (the pass's own estimate, so the MAGI iteration, `costAt`,
the forced pass and the cliff-plan trials price it unchanged; it sets `usesMagiEstimate`) and, in year E+1, last year's
realized MAGI. A per-year filing history makes the normal lookback read the lookback return's status. The cliff plan's IRMAA
lines move to this year's edges (growth 1) in a year with an in-year candidate. Rows whose charge an appeal lowered carry two
flat scalars, shown in the status tooltip.

**Tech Stack:** `Planner_US.html` (one inline `<script>` IIFE, no build), Node + Playwright tests (`tests/*.js`,
`test_*.js`), `tests/snapshot.js`, `tests/plan_off_anchor.js`, `tests/bench_runs_interleaved.js`.

**Spec:** `docs/superpowers/specs/2026-10-10-e3-irmaa-appeal-design.md` at this plan's commit (read all of it first:
decisions 1-8, section 5 in full, sections 6-8, 10, and the two review rounds in section 11; this plan argues from it and
cites its sections as "spec 5.3"). Background: `CLAUDE.md` ("MAGI iteration (both engines)" with "Third estimate (US, E1c)",
"Per-year solver and the cliff plan", the healthcare split under "US vs. Canada", "Testing checklist"); `tests/irmaa_magi.js`
for the test boilerplate this plan mirrors; `tests/se_health.js` for the 162(l) hooks.

**Tasks and the spec's stages (spec section 6):** Task 1 is stage 1 (decision 1, its own movers table). Stage 2 is split for
review size into Task 3 (the appealed charge, movers table 2a) and Task 4 (the cliff plan's lines, movers table 2b); each of
the three ends with an owner approval before `npm run snapshot:update`. Tasks 2, 5 and 6 move no number. One commit per task.

**Two corrections to the spec's section 8, found while writing this plan** (record them in the E3 implementation notes):
- Case 2 (a death in year 0 with entered prior MAGIs): year 2 also moves at stage 1 (D+2: the lookback is year 0's 125,000 on
  a joint return: 6,148.40 -> 5,000). Task 1 asserts it.
- Case 15's feedback variant: the alternative calculation runs in **both** window years (2 and 3: in year 3 the last-year
  candidate, year 2's realized MAGI, is tier 1, and the in-year candidate still flips at the edge), so
  `magiStats.seAlternative` rises by 2, not 1 (round 2's S2 said 1). Task 3 asserts 2 and the values of both years.

**Plan review, round 1** (independent Opus, of `d6f14c2`, owner-run; the reviewer applied Tasks 1-5 to a scratch tree): no
blocking findings. Measured movers: stage 1, 38 US scenarios (all survivor; guard-off anchor 539 identical / 38 different, the
same 38); stage 2a, 21 (retirement or survivor, first change at E or E+1; anchor 556 / 21); stage 2b, **0** (anchor 577
identical); Canada identical at every stage. Adopted (owner, 2026-10-11): two existing tests change by design in Task 3
(`tests/irmaa_gating.js`, `tests/medicare_enrollment.js` case 4: updated to the new values after approval); case 15's counter
read around one raw run; the measured spending of cases 13 (120,000) and 16 (130,000); the Playwright callout check reads
`#methodologyCard`; the minors (zero stage-2b movers expected, case 13's year 2, dump paths, the comma in Task 1 3.3). The
tooltip keeps this plan's wording ("Partner A's surcharge uses 2034 income instead of 2032"; single-person "the surcharge uses
..."), a recorded departure from spec 5.6's "Partner A charged on" / "You". The suggested pass count for the zero-charge case
is not used: in that household the conversion ceiling already sets `estUsed` and nothing drifts, so a year runs one pass
with or without the candidate; the observable checks (no row field, the premium only) and the snapshot and timing gates cover it.

**Plan review, round 2** (independent Opus, of `a118cbc`, owner-run; Tasks 1-5 applied to a scratch tree, every test run as
written: each red as predicted, then green; the movers reproduce 38 / 21 / 0 with anchors 539/38, 556/21, 577/0; `npm test`
green with all five tasks): **1 blocking**, 2 should-fix, 6 minor, all adopted (owner, 2026-10-11). B1: the appeal household's
timing cannot meet +5% against a base without the appeal (+15% to +35%, the extra passes of its window years): it is now a
recorded measurement for the owner's sign-off, the +5% gate stays on the default paths (spec section 7 changed). S1: a
removed "normal charge above 0" guard left every test green: a test-only counter `__test_irmaaInYearCalls` (0 for the
zero-charge household, above 0 for case 4). S2: nothing reached the per-return line growth: a direct `magiThresholds` case.
Minor: double-quoted messages (M1), the real comment text in Task 1 3.6 (M2), the `irmaa_gating.js` edit's extent (M3), the
anchor's printed names (M4), README spacing (M5), the untested forced-pass reset named in the record (M6). The owner asked for
a third review.

## Global Constraints

- Worktrees: `git -C C:\Users\Alex\code\Fire-Planner worktree add ../fp-e3 -b claude/e3-irmaa-appeal PLAN_COMMIT`
  (PLAN_COMMIT = the commit that adds this plan); the timing baseline `git -C C:\Users\Alex\code\Fire-Planner worktree add
  --detach ../fp-e3-base PLAN_COMMIT` (never moved); the movers baseline `git -C C:\Users\Alex\code\Fire-Planner worktree add
  --detach ../fp-e3-prev PLAN_COMMIT` (moved by `git -C ../fp-e3-prev checkout --detach <commit>` to the previous task's
  commit before Tasks 3 and 4). The planner code at PLAN_COMMIT is identical to `ea78ef6`'s. Link `node_modules` into each as
  a directory junction from the main checkout (`cmd /c mklink /J node_modules ..\Fire-Planner\node_modules` inside the
  worktree).
- Never edit, stash, check out, reset or commit in `C:\Users\Alex\code\Fire-Planner` (the owner's checkout and stashes;
  `stash@{0}` to `stash@{3}` are the owner's). Leave the worktrees `fp-e2` / `fp-e2-base` alone. Never push, open a PR or
  merge.
- **US only.** No change to `Planner_Canada.html`, `shared/`, or any `@@shared` region. Every edit site in this plan is
  outside the `@@shared` regions; check each against the `@@shared:... begin/end` pairs before editing (in particular
  `renderTable` is inside `@@shared:20-renderTable`: do not touch it; the tooltip goes in a new US-only annotator).
  `npm run check:shared` prints OK at every commit. Never run `npm run sync`.
- `npm test` green at every commit.
- **Exactness.** Tasks 2, 5 and 6 change no entry of `tests/snapshots/us.json`, `canada.json` or `legacy_state.json`.
  Tasks 1, 3 and 4 change numbers **only** as spec section 6 describes, and only after the owner approves that task's movers
  table (Step "STOP" in each). `canada.json` never changes. Every new term is skipped (not added as a zero) when its gate is
  off: with a `null` event table, a year without an open window, or a normal charge of 0, `healthcareCost` must give the
  very double it gives today (`healthcare += ia` in the same order, A before B).
- `tests/snapshots/ui_us.json` changes only in Task 5 (the healthcare callout text inside `<main>`; text hashes and lengths
  only) and the commit says which hashes moved. Any other `ui_us.json` change: stop and report.
- No heuristic, gate or threshold the spec does not name.
- **Timing** (Tasks 1, 3, 4 and the final record in Task 6): `node tests/bench_runs_interleaved.js --base ../fp-e3-base
  --rounds 21`, at most +5% per path, the median of three runs on a quiet machine (never while another chat runs probes on
  this machine). From Task 3 on also run `node tests/bench_runs_interleaved.js --base ../fp-e3-base --rounds 21 --states
  tx,ca --household appeal` (the option Task 3 adds) three times and report the median: **a recorded measurement for the
  owner's sign-off, not a gate** (owner, 2026-10-11, plan review round 2, B1; spec section 7). The base tree has no appeal,
  and the head tree's two window years run about three and two MAGI passes instead of one, so expect about +15% to +35%
  (the review measured at 7 rounds: tx +15.6% simulate / +34.6% historical, ca +22.4% / +27.5%); a figure far outside that
  range is a finding to report. Report the tables verbatim.
- **Movers tables** (Tasks 1, 3, 4): with `D=.superpowers/sdd/2026-10-10-e3/dumps-taskN` (N the task; git-excluded, never the
  worktree root): `node tests/snapshot.js --root ../fp-e3-prev --dump $D/A --update-nothing`, `node tests/snapshot.js --dump
  $D/B`, `node tests/snapshot.js --compare $D/A $D/B` (for Task 1 `fp-e3-prev` is at PLAN_COMMIT). The
  table lists: US count moved / identical (standard and historical), Canada identical (must be all), the movers grouped by
  the first changed field and year, every mover's first changed year checked against the task's expected rule, the largest
  healthcare and end-total moves, and any depletion change. Then `node tests/plan_off_anchor.js --base ../fp-e3-prev` (the
  guard-off comparison): its differing count must equal the task's guard-off movers, and every name it prints (it prints at
  most 25, in its own naming format) must be among the movers list.
- Each commit: only your paths, `git commit -m "..." -- <paths>` (`git add` new files first), message ending
  `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>`.
- Ledger and task reports in `.superpowers/sdd/2026-10-10-e3/` inside the worktree (git-excluded).
- Shell: never put Markdown backticks inside a double-quoted shell string; write text to a file and insert it with a small
  node script. The tree is CRLF; never use `sed -i` on any tracked file (it strips CRLF); edit with the Edit tool or node.
  Never write `cat > file` without a heredoc (it waits on stdin).
- Tests are written FIRST and run red (each task's Step 2); record the red output in the task report.
- Line numbers below are at PLAN_COMMIT and drift as you edit; find each site by the quoted code.
- Hand-computed expectations are numbers worked by hand (shown in the plan), never values produced by calling the engine's
  own formula.
- 2026 IRMAA tiers (`IRMAA_TIERS`, ~7403): single 109,000 / 137,000 / 171,000 / 205,000 / 500,000; joint 218,000 / 274,000 /
  342,000 / 410,000 / 750,000; annual surcharges 1,148.40 / 2,884.80 / 4,620.00 / 6,355.20 / 6,936.00 per enrolled person.

## Review Focus

1. **A run with no event, or no Medicare in an event window, changes by even one bit.** A user who never retires past 63
   expects today's numbers. Pinned by the snapshot gate in every task (non-movers identical) and by Task 2's null-table
   cases; the `healthcareCost` rewrite in Task 3 keeps `healthcare += ia` in today's order (Task 3, Step 3).
2. **A year whose normal charge is 0 inside an event window.** It must not set `usesMagiEstimate` (no extra MAGI passes, no
   number change). Task 3, Step 1, case `zero normal charge`: a retiree whose lookback is already under the first tier.
3. **A survivor whose death year has entered prior MAGIs** (death in year 0, or before the plan): each entered return is
   charged on the tiers of the return it really was. Task 1 cases 2 and 2b; Task 3 case 2 at stage 2.
4. **The 162(l) deduction at a tier edge in an appeal year** (a self-employed retiree on Medicare): the year finishes and the
   deduction never exceeds the premium charged. Task 3, Step 1, case 15 and its feedback variant.
5. **The cliff plan's `apply` replays `choose` exactly with in-year lines.** Task 4, Step 1: the `apply(choose's intents)`
   identity on case 16's household, plus `tests/cliff_plan.js` and `tests/plan_off_anchor.js`.

---

### Task 1: The lookback reads the filing status of the lookback return (decision 1; stage 1 movers)

**Files:**
- Modify: `Planner_US.html`: a new `irmaaLookbackFiling` just below `irmaaLookbackSplit` (~7536-7545); `healthcareCost`
  (~9214-9325: signature and the IRMAA block); `runProjection` (~10838: a new history array and `marriedAtDeath`); the year
  loop (~11139: the filing history write; ~11297-11318: `hcArgs`; ~11355-11379: `irmaaFiling2` removed, `irmaaAt`; ~11805:
  the `magiThresholds` call's `irmaa.filing`; ~11853: `irmaaChecks`).
- Create: `tests/irmaa_appeal.js`; add `node tests/irmaa_appeal.js` to `package.json`'s `test` script right after
  `node tests/irmaa_magi.js`.
- Modify: `tests/plan_off_anchor.js` (the baseline note, lines 1-4), `tests/snapshots/us.json` (after the owner's approval).

**Interfaces:**
- Produces: `irmaaLookbackFiling(filingHistory, year, filing, deathYear, marriedAtDeath)` -> a filing status string;
  `healthcareCost` parameters `irmaaFilingHistory = null`, `deathYear = Infinity`, `marriedAtDeath = false`;
  `runProjection` locals `irmaaFilingHistory` (array, one entry per plan year) and `marriedAtDeath` (boolean). Task 3 adds
  to the same `healthcareCost` and reads `irmaaFilingHistory[s]`.

- [ ] **Step 1: Write the failing test**

Create `tests/irmaa_appeal.js`:

```js
// E3: the IRMAA appeal for a life-changing event (form SSA-44) and the lookback's filing status (US).
// Spec: docs/superpowers/specs/2026-10-10-e3-irmaa-appeal-design.md; "case N" is the spec's section 8 numbering. Hand-computed:
// 2026 tiers, no inflation, Medicare 10,000 a year for the household (half per partner), no Social Security.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') }); // plan year 0 is 2026
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(200);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  // tests/irmaa_magi.js's quiet base, plus no wage growth and no plan contributions (spec 8, round 1 M9: a salary under the
  // Roth catch-up line would otherwise defer catch-ups pre-tax).
  const QUIET = {
    stateTax: 'tx', acaEnabled: false, inflation: 0, medicalInflation: 0, hysaRate: 0, dividendYield: 0, returnRate: 0, bondReturn: 0,
    bondYears: 0, taxable: 0, cash: 0, cashReserve: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0,
    roth401kA: 0, roth401kB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, maintenance: 0, incomeA: 0, incomeB: 0, spending: 20000,
    medicareYearly: 10000, ltcEnabled: false, guardrailsEnabled: false, survivorEnabled: false, rothConvEnabled: false, irmaaPriorKnown: false,
    children: [], loans: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
    pensionYearlyA: 0, pensionYearlyB: 0, ssMonthlyA: 0, ssMonthlyB: 0,
    incomeGrowth: 0, k401PctA: 0, k401PctB: 0, catchupPctA: 0, catchupPctB: 0, iraPctA: 0, iraPctB: 0, profitSharingPctA: 0,
    profitSharingPctB: 0, megaBackdoor: false,
  };
  // simulate() under a state patch; returns the rows and the run's event table (non-enumerable `irmaaAppeal`, Task 2:
  // 'absent' before Task 2, null or plain arrays after). Restores the state afterwards.
  const run = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        const sim = window.__test_simulate();
        const t = sim.irmaaAppeal;
        return JSON.parse(JSON.stringify({
          rows: sim.rows,
          table: t === undefined ? 'absent' : t === null ? null : { eventA: Array.from(t.eventA), eventB: Array.from(t.eventB) },
        }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...QUIET, ...patch });
  const hc = (rows, y) => rows[y].healthcare;

  // --- Stage 1 (decision 1): the lookback reads the filing status of the return it uses (spec 5.1) ---
  // Case 1: married, both 68, retired at 65, pensions 125,000 each (joint MAGI 250,000: joint tier 1); A dies at 71
  // (deathYear 3; the deceased's pension stops; B's MAGI 125,000 from year 3).
  const C1 = {
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 68, ageB: 68, retireAgeA: 65, retireAgeB: 65,
    lifeExpectancyA: 80, lifeExpectancyB: 80, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 71, survivorSpendingPct: 75,
    pensionCoverage: 'both', pensionYearlyA: 125000, pensionYearlyB: 125000, pensionStartAgeA: 65, pensionStartAgeB: 65,
  };
  const c1 = (await run(C1)).rows;
  for (const y of [0, 1, 2]) near(hc(c1, y), 12296.8, 1e-6, `case 1 year ${y}: both on Medicare, joint tier 1 each`);
  near(hc(c1, 3), 6148.4, 1e-6, 'case 1 year 3 (D): B only, lookback year 1 joint 250,000');
  near(hc(c1, 4), 6148.4, 1e-6, 'case 1 year 4 (D+1): year 2 joint 250,000 on the JOINT tiers (was single tier 4: 11,355.20)');
  near(hc(c1, 5), 5000, 1e-6, 'case 1 year 5 (D+2): year 3 B 125,000 on a joint return, under 218,000 (was 6,148.40)');
  near(hc(c1, 6), 6148.4, 1e-6, 'case 1 year 6: year 4 B 125,000 single, tier 1');

  // Case 2: case 1's couple, A dies at 68 (deathYear 0), entered prior MAGIs 250,000 for both years (joint returns).
  const C2 = { ...C1, survivorDeathAge: 68, irmaaPriorKnown: true, irmaaMagiPrior2: 250000, irmaaMagiPrior1: 250000 };
  const c2 = (await run(C2)).rows;
  near(hc(c2, 0), 6148.4, 1e-6, 'case 2 year 0: entered joint 250,000 on the joint tiers');
  near(hc(c2, 1), 6148.4, 1e-6, 'case 2 year 1: entered joint 250,000 on the joint tiers (was single tier 4: 11,355.20)');
  near(hc(c2, 2), 5000, 1e-6, 'case 2 year 2 (D+2): year 0 B 125,000 on its joint return (was single tier 1: 6,148.40)');
  near(hc(c2, 3), 6148.4, 1e-6, 'case 2 year 3: year 1 B 125,000 single, tier 1');

  // Case 2b: A dies at 66 (deathYear -2: 2024's return joint, 2025's B's own; before the plan, not an event).
  const C2B = { ...C1, survivorDeathAge: 66, irmaaPriorKnown: true, irmaaMagiPrior2: 250000, irmaaMagiPrior1: 125000 };
  const c2b = (await run(C2B)).rows;
  near(hc(c2b, 0), 6148.4, 1e-6, 'case 2b year 0: the entered joint 2024 return on the joint tiers (was single tier 4: 11,355.20)');
  near(hc(c2b, 1), 6148.4, 1e-6, 'case 2b year 1: B 2025 125,000 on the single tiers (year 0 status)');
  near(hc(c2b, 2), 6148.4, 1e-6, 'case 2b year 2: year 0 B 125,000 single');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('irmaa_appeal: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add `node tests/irmaa_appeal.js` to `package.json`'s `test` script right after `node tests/irmaa_magi.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/irmaa_appeal.js`
Expected: FAIL at `case 1 year 4 ... : 11355.2 vs 6148.4`. Record the output.

- [ ] **Step 3: Implement**

3.1. Just below `irmaaLookbackSplit` (ends `return [magiHistoryA[y] || 0, magiHistoryB[y] || 0];\n  }`), add:

```js
  // E3 (spec 5.1, decision 1): the filing status of the return IRMAA's lookback reads, whose tiers SSA uses (20 CFR
  // 418.1120). The lookback year's own status; for the plan's first two years year 0's stands for the earlier returns, except
  // that an entered return from a year in which a married partner (who dies in deathYear) was still alive was joint.
  function irmaaLookbackFiling(filingHistory, year, filing, deathYear, marriedAtDeath) {
    const L = year - 2;
    if (L < 0 && state.irmaaPriorKnown && marriedAtDeath && L <= deathYear) return 'mfj';
    return filingHistory ? filingHistory[Math.max(0, L)] : filing;
  }
```

3.2. `healthcareCost`: in the destructured parameters, after `twoReturnHistory = null,` add
`irmaaFilingHistory = null,`, `deathYear = Infinity,`, `marriedAtDeath = false,`. Replace the household branch's lookback
(`const lookbackMagi = irmaaLookbackMagi(irmaaHistory, year);` and the two `irmaaSurcharge(lookbackMagi, filing, year)`
calls) so the tier filing is `lbFiling`:

```js
    } else {
      const lookbackMagi = irmaaLookbackMagi(irmaaHistory, year),
        lbFiling = irmaaLookbackFiling(irmaaFilingHistory, year, filing, deathYear, marriedAtDeath);
      if (medicareEligibleA) {
        const ia = irmaaSurcharge(lookbackMagi, lbFiling, year);
```
and `const ib = irmaaSurcharge(lookbackMagi, lbFiling, year);` for B. Nothing else in the block changes in this task.

3.3. `runProjection`: the `const` declaration list ends `twoReturnHistory = [];` (~10886); change that line to
`twoReturnHistory = [],` and add after it, as the list's new last entry,
`// E3: each year's filing status, the IRMAA lookback's tier table (spec 5.1).` and `irmaaFilingHistory = [];`. Just after
the `deathYear` declaration and the death clamp (after `if (deceasedIsB) retireAgeB = Math.min(...)`), add:

```js
    // E3 (spec 5.1): whether the couple was married when a partner died (the lookback reads joint tiers for entered returns from
    // before the death). False without a death, in single-person mode, or for an unmarried couple.
    const marriedAtDeath = deathYear < Infinity && !singlePerson && (state.marryLater ? state.ageA + deathYear >= state.marriageAgeA : state.filingStatus === 'mfj');
```

3.4. Year loop: right after `const twoReturns = !profile.singlePerson && !filingRow(filing).joint;` (~11139) add
`irmaaFilingHistory[year] = filing; // E3: once per year, before any healthcareCost call (spec 5.1, round 1 M2)`.

3.5. `hcArgs` (~11297): after `twoReturnHistory,` add `irmaaFilingHistory,`, `deathYear,`, `marriedAtDeath,`.

3.6. The plan's filing (spec 5.1): delete `let filing2 = null;` and the `const irmaaFiling2 = () => ...;` statement. In
`irmaaAt`, replace `irmaaFiling2()` with `filing`. At the `magiThresholds` call (~11805) replace
`irmaa: { filing: irmaaFiling2(), a: medA, b: medB }` with `irmaa: { filing, a: medA, b: medB }`. In `irmaaChecks.push`
(~11853) replace `filing: irmaaFiling2()` with `filing`. Update the comment above `year2`: in "to the partners on Medicare and
alive then, against that year's tiers and filing status;" replace "and filing status" with "(the filing status of this year's
return, which SSA will read: E3)", and replace its last sentence, "The charging year's filing status is looked up only when a
solver asks for it.", with "The tier table is this year's return's filing status (E3, spec 5.1)." `grep -n irmaaFiling2 Planner_US.html`
must find nothing.

- [ ] **Step 4: Run the tests**

Run: `node tests/irmaa_appeal.js` -> `irmaa_appeal: ok`. Run `node tests/irmaa_magi.js`, `node tests/irmaa_startup.js`,
`node tests/irmaa_gating.js`, `node tests/two_return_magi.js`, `node tests/cliff_plan.js`, `node tests/cliff_guard.js`,
`node tests/solver_hooks.js`, `node tests/survivor_symmetry.js`: all pass unchanged (a failure in one of them is a finding:
stop and report; do not edit its expectations).

- [ ] **Step 5: Movers table (stage 1) and the anchor**

Run the movers commands (Global Constraints) with `fp-e3-prev` at PLAN_COMMIT. Expected rule (spec 6, stage 1): every mover
has survivor modeling on a married couple; its first changed year is D-1 or later (D-1 and D only in plan-priced fields:
`cliffChoice`, a conversion or a draw), and its first `healthcare` change is in D+1 or D+2. Every other scenario identical;
Canada all identical. `node tests/plan_off_anchor.js --base ../fp-e3-prev`: the differing scenarios are exactly the
guard-off movers (D+1 / D+2 charges; nothing in D-1 or D, where only the plan moved). Run the timing gate (three runs).

- [ ] **Step 6: STOP for the owner's approval**

Report the movers table, the anchor result and the timing tables. Do not run `npm run snapshot:update` and do not commit
until the owner approves the movers in writing.

- [ ] **Step 7: After approval: update, re-base the anchor, commit**

`npm run snapshot:update` (the `us.json` diff touches only the approved movers: check by listing the changed scenario keys;
`ui_us.json` must not change). Update `tests/plan_off_anchor.js`'s header (lines 1-4) to read that the baseline is any tree
at or after this task's commit, adding "E3 Task 1 (the lookback's filing status) moved N guard-off scenarios by design: I
identical, N different against PLAN_COMMIT" with the real counts. `npm test` green, `npm run check:shared` OK. Commit:

```bash
git add tests/irmaa_appeal.js
git commit -m "E3 Task 1: the IRMAA lookback reads the filing status of the lookback return (decision 1; irmaaLookbackFiling, the filing history, irmaaAt / lines / irmaaChecks on this year's return); us.json: the owner-approved stage-1 movers; plan_off_anchor re-based; tests/irmaa_appeal.js" -- Planner_US.html package.json tests/irmaa_appeal.js tests/plan_off_anchor.js tests/snapshots/us.json
```

---

### Task 2: The event table (no number change)

**Files:**
- Modify: `Planner_US.html`: a new `irmaaAppealTable` just above `healthcareCost`'s comment block (~9202); `runProjection`
  (after `projectionYears` ~10954: build the table; ~12082: attach it to the result).
- Test: `tests/irmaa_appeal.js`.

**Interfaces:**
- Consumes: `deathYear`, `deceasedIsA/B`, the clamped `retireAgeA/B`, `projectionYears`, `singlePerson` (runProjection
  locals).
- Produces: `irmaaAppealTable({ singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB,
  projectionYears })` -> `null` or `{ eventA: Int8Array, eventB: Int8Array }` (length `projectionYears + 1`; value at index E:
  0 none, 1 job end, 2 retirement, 3 death); the `runProjection` local `appeal`; the result's non-enumerable `irmaaAppeal`.
  Task 3 reads `appeal.eventA/B`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/irmaa_appeal.js` before the `errors` check:

```js
  // --- The event table (spec 5.2; cases 10 and 11) ---
  const zeros = (n) => new Array(n).fill(0);
  const withAt = (n, pairs) => { const a = zeros(n); for (const [i, v] of pairs) a[i] = v; return a; };
  // Case 11, case 7's couple: A 66 (salary 300,000, retires at 68: E = 2), B 70 retired on Medicare; married: B covered too.
  const C7 = {
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 66, ageB: 70, retireAgeA: 68, retireAgeB: 65,
    lifeExpectancyA: 80, lifeExpectancyB: 84, incomeA: 300000, pensionCoverage: 'b', pensionYearlyB: 60000, pensionStartAgeB: 65,
  };
  let t = (await run(C7)).table;
  assert.deepStrictEqual(t, { eventA: withAt(15, [[2, 2]]), eventB: withAt(15, [[2, 2]]) }, 'table: a retirement covers the spouse');
  // Case 8's single: a W-2 stream (ages 60-69) ends: E = 4, kind 1.
  const STREAM = { amount: 200000, startAge: 60, endAge: 69, followGrowth: false, growth: 0, owner: 'A', kind: 'wages', contribute: false, healthPremium: 0 };
  const C8 = {
    singlePerson: true, ageA: 66, retireAgeA: 60, lifeExpectancyA: 80, pensionCoverage: 'a', pensionYearlyA: 40000, pensionStartAgeA: 60,
    incomeSources: [STREAM],
  };
  t = (await run(C8)).table;
  assert.deepStrictEqual(t.eventA, withAt(15, [[4, 1]]), 'table: a job stream ends');
  // A married death at year 0: the survivor's [0] = 3.
  t = (await run({ ...C1, survivorDeathAge: 68 })).table;
  assert.deepStrictEqual(t, { eventA: zeros(13), eventB: withAt(13, [[0, 3]]) }, 'table: a death in year 0');
  // A retirement at 68 (E = 2) and a W-2 stream whose last working age is 68 (endAge 68: E = 3), same person aged 66.
  const C12 = {
    singlePerson: true, ageA: 66, retireAgeA: 68, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages',
    pensionCoverage: 'a', pensionYearlyA: 60000, pensionStartAgeA: 68,
    incomeSources: [{ ...STREAM, amount: 50000, startAge: 68, endAge: 68 }],
  };
  t = (await run(C12)).table;
  assert.deepStrictEqual(t.eventA, withAt(15, [[2, 2], [3, 1]]), 'table: retirement then a stream end');
  // A retirement and a death in the same year: married couple both 66; A (salary 100,000, retiring at 70) dies at 70.
  t = (await run({
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 66, ageB: 66, retireAgeA: 70, retireAgeB: 60,
    lifeExpectancyA: 85, lifeExpectancyB: 85, incomeA: 100000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 70,
    survivorSpendingPct: 75,
  })).table;
  assert.deepStrictEqual(t, { eventA: zeros(20), eventB: withAt(20, [[4, 3]]) }, 'table: retirement and death in one year: the higher kind');
  // An event at the plan's last year: single 66, life expectancy 70, retiring at 70 (E = 4 = projectionYears).
  t = (await run({ singlePerson: true, ageA: 66, retireAgeA: 70, lifeExpectancyA: 70, incomeA: 100000 })).table;
  assert.deepStrictEqual(t.eventA, withAt(5, [[4, 2]]), 'table: an event at the last plan year');
  // Round 2 minor 3: an unmarried couple; A's retirement is clamped to A's death (E = 4): covers only the dead partner.
  t = (await run({
    singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 66, ageB: 66, retireAgeA: 75, retireAgeB: 60,
    lifeExpectancyA: 85, lifeExpectancyB: 85, incomeA: 100000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 70,
    survivorSpendingPct: 75,
  })).table;
  assert.strictEqual(t, null, 'table: a retirement clamped to an unmarried partner death covers nobody');
  // Case 10 (not events).
  const S200 = { singlePerson: true, ageA: 66, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages' };
  let r = await run({ ...S200, retireAgeA: 66, irmaaPriorKnown: true, irmaaMagiPrior2: 200000, irmaaMagiPrior1: 200000 });
  assert.strictEqual(r.table, null, 'case 10(a): a retirement at today\'s age is not an event');
  near(hc(r.rows, 0), 14620, 1e-6, 'case 10(a) year 0: entered 200,000, tier 3');
  near(hc(r.rows, 1), 14620, 1e-6, 'case 10(a) year 1: entered 200,000, tier 3');
  assert.strictEqual((await run({ ...S200, incomeA: 0, retireAgeA: 68 })).table, null, 'case 10(b): a job with no pay');
  assert.strictEqual((await run({ ...C1, filingStatus: 'single' })).table, null, 'case 10(c): an unmarried partner death');
  t = (await run({
    ...C1, ageA: 66, ageB: 66, survivorDeathAge: 70, incomeSources: [{ ...STREAM, startAge: 66, endAge: 69 }],
  })).table;
  assert.deepStrictEqual(t, { eventA: zeros(15), eventB: withAt(15, [[4, 3]]) }, 'case 10(d): a stream ending in its owner\'s death year is the death event');
  assert.strictEqual((await run({ ...C1, survivorDeathAge: 66 })).table, null, 'case 10(e): a death before the plan');
  assert.strictEqual((await run({ singlePerson: true, ageA: 50, retireAgeA: 58, lifeExpectancyA: 90, incomeA: 100000 })).table, null,
    'case 10(f): nobody it covers is 65 by E+1');
  const def = await page.evaluate(() => { const sim = window.__test_simulate(); return sim.irmaaAppeal === null; });
  assert.strictEqual(def, true, 'case 10(g): the default state has no table');
  assert.strictEqual(Object.keys(await page.evaluate(() => window.__test_simulate())).includes('irmaaAppeal'), false,
    'the table is not an enumerable result field');
```

(Array lengths: `projectionYears + 1` = `max(lifeExpectancyA - ageA, lifeExpectancyB - ageB) + 1`; C7: 15; C1: 13; the
same-year couple: 20; the last-year single: 5; 10(d): 15.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/irmaa_appeal.js`. Expected: FAIL at `table: a retirement covers the spouse` (`table` is `'absent'`).

- [ ] **Step 3: Implement**

3.1. Just above the `// Healthcare and long-term-care cost for the year.` comment of `healthcareCost`, add:

```js
  // E3 (spec 5.2): the IRMAA appeal events of a run, per person, by first post-event year E (the year after the last
  // working year, or the death year): 0 none, 1 the end of a W-2 or self-employed stream, 2 a main-job retirement, 3 a
  // married spouse's death; the highest kind on a tie. An event covers its owner, and the owner's spouse when the couple is
  // married in year E (a death covers only the survivor); it is kept for a covered person alive in year E and 65 or over by
  // year E+1. Null when no event is kept (the default household, retiring at 55, allocates nothing).
  function irmaaAppealTable({ singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB, projectionYears }) {
    const married = (y) => !singlePerson && (state.marryLater ? state.ageA + y >= state.marriageAgeA : state.filingStatus === 'mfj');
    let eventA = null,
      eventB = null;
    const put = (b, E, kind) => {
      if ((b ? deceasedIsB : deceasedIsA) && E >= deathYear) return; // dead in year E
      if ((b ? state.ageB : state.ageA) + E + 1 < 65) return; // cannot be on Medicare by E+1
      if (eventA === null) {
        eventA = new Int8Array(projectionYears + 1);
        eventB = new Int8Array(projectionYears + 1);
      }
      const ev = b ? eventB : eventA;
      if (kind > ev[E]) ev[E] = kind;
    };
    const cover = (b, E, kind) => {
      put(b, E, kind);
      if (married(E)) put(!b, E, kind);
    };
    const eA = retireAgeA - state.ageA;
    if (state.incomeA > 0 && eA >= 1 && eA <= projectionYears) cover(false, eA, 2);
    if (!singlePerson) {
      const eB = retireAgeB - state.ageB;
      if (state.incomeB > 0 && eB >= 1 && eB <= projectionYears) cover(true, eB, 2);
    }
    for (const s of state.incomeSources) {
      if ((s.kind !== 'wages' && s.kind !== 'self') || !(s.amount > 0) || !(s.startAge <= s.endAge)) continue;
      const b = !singlePerson && s.owner === 'B',
        E = s.endAge + 1 - (b ? state.ageB : state.ageA);
      if (E < 1 || E > projectionYears) continue;
      if ((b ? deceasedIsB : deceasedIsA) && E >= deathYear) continue; // ended by its owner's death: the death event
      cover(b, E, 1);
    }
    if ((deceasedIsA || deceasedIsB) && deathYear >= 0 && deathYear <= projectionYears && married(deathYear)) put(deceasedIsA, deathYear, 3);
    return eventA === null ? null : { eventA, eventB };
  }
```

(`put(deceasedIsA, ...)`: the survivor is B when A died, so `b = deceasedIsA`.)

3.2. `runProjection`: right after the `projectionYears` declaration (~10950) add:

```js
    // E3 (spec 5.2): the IRMAA appeal events of this run (null for most runs). Built after the death clamp of retireAgeA/B.
    const appeal = irmaaAppealTable({ singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB, projectionYears });
```

3.3. Just before `Object.defineProperty(result, 'estate', {` (~12082) add:

```js
    // E3: the run's IRMAA appeal events (tests read the very table the run used); not enumerable, so the result's own
    // fields and every snapshot are unchanged.
    Object.defineProperty(result, 'irmaaAppeal', { value: appeal });
```

- [ ] **Step 4: Run the tests**

`node tests/irmaa_appeal.js` -> ok. `node tests/snapshot.js` passes against the committed baseline (no number moved: the
table is not read yet). `npm test` green. Timing: not required (one small function per run); state that in the report.

- [ ] **Step 5: Commit**

```bash
git commit -m "E3 Task 2: the IRMAA appeal event table (irmaaAppealTable; on the run's result, not enumerable); no number change" -- Planner_US.html tests/irmaa_appeal.js
```

---

### Task 3: The appealed charge in `healthcareCost`, the rows, the benchmark household (stage 2a movers)

**Files:**
- Modify: `Planner_US.html`: two helpers just below `irmaaAppealTable`; `healthcareCost` (signature, the IRMAA block, the
  return value); the year loop (`irmaaSsH` / `irmaaStA` moved above `hcArgs`; `hcArgs`; `appealYrA/B` and `inYrA/B` after
  `hcOut`; the forced pass; the row).
- Modify: `tests/irmaa_appeal.js`, `tests/bench_runs_interleaved.js` (the `--household appeal` option),
  `tests/plan_off_anchor.js` (header), `tests/snapshots/us.json`, `tests/irmaa_gating.js` and `tests/medicare_enrollment.js`
  (the last three after approval).

**Interfaces:**
- Consumes: Task 1's `irmaaFilingHistory`, `irmaaLookbackFiling`, `healthcareCost`'s new parameters; Task 2's `appeal`.
- Produces: `healthcareCost` parameters `appeal = null`, `irmaaSsH = 0`, `ssA = 0`, `ssB = 0`, `irmaaStA = 'single'`; its
  return gains `appealA`, `appealB` (plan year used or -1) and `inYearA`, `inYearB` (booleans); year-loop locals `appealYrA`,
  `appealYrB`, `inYrA`, `inYrB`; row fields `irmaaAppealYearA/B` (calendar tax year) and `irmaaAppealKindA/B` (1, 2 or 3),
  present only where the appeal lowered that partner's charge. Task 4 reads `inYrA/B`; Task 5 reads the row fields.

- [ ] **Step 1: Write the failing tests**

1a. Change Task 1's case 1 and case 2 expectations to their stage-2 values (spec 8 case 3 and case 2 "after stage 2"; the
stage-2 values replace the stage-1 ones in the file):
- case 1: `hc(c1, 3)` and `hc(c1, 4)` are `5000` (messages, written as double-quoted JS string literals because the first
  contains an apostrophe: "case 3, year 3 (D): appealed on year 3's 125,000 on its joint return: 0" and "case 3, year 4 (D+1):
  min(1,148.40; year 3: 0; year 4 single: 1,148.40) = 0"). Add
  `assert.strictEqual(c1[3].irmaaAppealYearB, 2029); assert.strictEqual(c1[3].irmaaAppealKindB, 3);`,
  `assert.strictEqual(c1[4].irmaaAppealYearB, 2029);`, and `for (const r of c1) assert.strictEqual(r.irmaaAppealYearA, undefined);`
  and `assert.strictEqual(c1[5].irmaaAppealYearB, undefined);`.
- case 2: `hc(c2, 0)` and `hc(c2, 1)` are `5000`; `c2[0].irmaaAppealYearB === 2026`, `c2[0].irmaaAppealKindB === 3`,
  `c2[1].irmaaAppealYearB === 2026` (year 1: min(1,148.40; year 0's 125,000 on `irmaaFilingHistory[0]` = mfj: 0; year 1's
  125,000 single: 1,148.40) = 0, the earlier year). Years 2 and 3 unchanged.

1b. Append (before the `errors` check):

```js
  // --- Stage 2a: the appealed charge (spec 5.3, 5.4) ---
  // Case 4: single, 66, salary 200,000 (year 0-1 MAGI 200,000: tier 3), retires at 68 (E = 2), pension 60,000 from 68.
  const S4 = { ...S200, retireAgeA: 68, pensionCoverage: 'a', pensionYearlyA: 60000, pensionStartAgeA: 68 };
  r = await run(S4);
  near(hc(r.rows, 2), 10000, 1e-6, 'case 4 year 2: min(4,620; year 2 60,000: 0)');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, 2028); assert.strictEqual(r.rows[2].irmaaAppealKindA, 2);
  near(hc(r.rows, 3), 10000, 1e-6, 'case 4 year 3: min(4,620; year 2: 0; year 3: 0)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2028, 'case 4 year 3: the earlier year on a tie');
  near(hc(r.rows, 4), 10000, 1e-6, 'case 4 year 4: lookback year 2, no appeal');
  assert.strictEqual(r.rows[4].irmaaAppealYearA, undefined);
  const LUMP = (age) => ({ amount: 100000, age, flat: true, kind: 'ordinary', owner: 'A', gainPct: 100, activeBusiness: false });
  // Case 5: case 4 plus 100,000 ordinary at 69 (year 3 MAGI 160,000: tier 2).
  r = await run({ ...S4, oneTimeIncome: [LUMP(69)] });
  near(hc(r.rows, 3), 10000, 1e-6, 'case 5 year 3: min(4,620; year 2: 0; year 3: 2,884.80)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2028);
  near(hc(r.rows, 5), 12884.8, 1e-6, 'case 5 year 5: lookback year 3 160,000, tier 2');
  // Case 6: case 4 plus the 100,000 at 68 (year 2 MAGI 160,000).
  r = await run({ ...S4, oneTimeIncome: [LUMP(68)] });
  near(hc(r.rows, 2), 12884.8, 1e-6, 'case 6 year 2: min(4,620; 2,884.80)');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, 2028);
  near(hc(r.rows, 3), 10000, 1e-6, 'case 6 year 3: min(4,620; year 2: 2,884.80; year 3: 0)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2029);
  // Case 7: a spouse's retirement covers both (C7: joint 360,000 in years 0-1, joint tier 3).
  r = await run(C7);
  near(hc(r.rows, 0), 9620, 1e-6, 'case 7 year 0: B only, 5,000 + 4,620');
  near(hc(r.rows, 1), 9620, 1e-6, 'case 7 year 1');
  near(hc(r.rows, 2), 10000, 1e-6, 'case 7 year 2: both appealed on year 2 60,000 (was 19,240)');
  near(hc(r.rows, 3), 10000, 1e-6, 'case 7 year 3 (was 19,240)');
  for (const y of [2, 3]) for (const P of ['A', 'B']) {
    assert.strictEqual(r.rows[y]['irmaaAppealYear' + P], 2028, `case 7 year ${y} ${P}`);
    assert.strictEqual(r.rows[y]['irmaaAppealKind' + P], 2);
  }
  // Case 8: a job stream ends (C8: MAGI 240,000 in years 0-3, single tier 4).
  r = await run(C8);
  for (const y of [0, 1, 2, 3]) near(hc(r.rows, y), 16355.2, 1e-6, `case 8 year ${y}`);
  near(hc(r.rows, 4), 10000, 1e-6, 'case 8 year 4: appealed (was 16,355.20)');
  near(hc(r.rows, 5), 10000, 1e-6, 'case 8 year 5: appealed (was 16,355.20)');
  assert.strictEqual(r.rows[4].irmaaAppealKindA, 1); assert.strictEqual(r.rows[4].irmaaAppealYearA, 2030);
  assert.strictEqual(r.rows[5].irmaaAppealYearA, 2030, 'case 8 year 5: last year and this year tie: the earlier');
  near(hc(r.rows, 6), 10000, 1e-6, 'case 8 year 6: lookback year 4 40,000');
  // Case 9: two returns, own events only (A: case 8's stream and pension; B: pension 150,000, single tier 2).
  r = await run({
    singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 66, ageB: 66, retireAgeA: 60, retireAgeB: 60,
    lifeExpectancyA: 80, lifeExpectancyB: 80, pensionCoverage: 'both', pensionYearlyA: 40000, pensionYearlyB: 150000,
    pensionStartAgeA: 60, pensionStartAgeB: 60, incomeSources: [STREAM],
  });
  for (const y of [0, 1, 2, 3]) near(hc(r.rows, y), 19240, 1e-6, `case 9 year ${y}: 10,000 + 6,355.20 + 2,884.80`);
  near(hc(r.rows, 4), 12884.8, 1e-6, 'case 9 year 4: A appealed, B tier 2');
  near(hc(r.rows, 5), 12884.8, 1e-6, 'case 9 year 5');
  for (const row of r.rows) assert.strictEqual(row.irmaaAppealYearB, undefined, 'case 9: B never appealed');
  // Case 12: the kind a row reports (C12: retirement at 68, a 50,000 W-2 stream at 68 only).
  r = await run(C12);
  near(hc(r.rows, 2), 11148.4, 1e-6, 'case 12 year 2: min(4,620; 110,000: 1,148.40)');
  assert.deepStrictEqual([r.rows[2].irmaaAppealYearA, r.rows[2].irmaaAppealKindA], [2028, 2]);
  near(hc(r.rows, 3), 10000, 1e-6, 'case 12 year 3: min(4,620; year 2: 1,148.40; year 3: 0)');
  assert.deepStrictEqual([r.rows[3].irmaaAppealYearA, r.rows[3].irmaaAppealKindA], [2029, 1]);
  near(hc(r.rows, 4), 10000, 1e-6, 'case 12 year 4: min(1,148.40; year 3: 0; year 4: 0)');
  assert.deepStrictEqual([r.rows[4].irmaaAppealYearA, r.rows[4].irmaaAppealKindA], [2029, 1]);
  r = await run({ ...C12, oneTimeIncome: [LUMP(69)] });
  near(hc(r.rows, 3), 11148.4, 1e-6, 'case 12 variant year 3: min(4,620; year 2: 1,148.40; year 3 160,000: 2,884.80)');
  assert.deepStrictEqual([r.rows[3].irmaaAppealYearA, r.rows[3].irmaaAppealKindA], [2028, 2]);
  near(hc(r.rows, 4), 10000, 1e-6, 'case 12 variant year 4: min(1,148.40; year 3: 2,884.80; year 4: 0)');
  assert.deepStrictEqual([r.rows[4].irmaaAppealYearA, r.rows[4].irmaaAppealKindA], [2030, 1]);
  // Review Focus 2: a zero normal charge in a window is never priced (no usesMagiEstimate, no row field). Case 4 with
  // a salary of 100,000 (year-0 MAGI under 109,000: the normal charge in years 2-3 is 0).
  r = await run({ ...S4, incomeA: 100000 });
  near(hc(r.rows, 2), 10000, 1e-6, 'zero normal charge: year 2');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, undefined, 'zero normal charge: no appeal recorded');
  // The exact observable (plan review round 2, S1): how often the in-year candidate was priced, around one raw run (the
  // re-plan of a new state runs first, outside the count).
  const inYearCalls = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        window.__test_simulate();
        window.__test_irmaaInYearCalls(true);
        window.__test_simulateRaw();
        return window.__test_irmaaInYearCalls(true);
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...QUIET, ...patch });
  assert.strictEqual(await inYearCalls({ ...S4, incomeA: 100000 }), 0, 'zero normal charge: the in-year candidate is never priced');
  assert((await inYearCalls(S4)) > 0, 'case 4: the in-year candidate is priced');
  // Case 14: an inherited traditional IRA (10-year rule) of 600,000 received at 67 (year 1), heir A (factor 20.4 at 68):
  // draws 60,000 in years 2 and 3, MAGI 120,000 (tier 1).
  r = await run({ ...S4, oneTimeIncome: [{ amount: 600000, age: 67, flat: true, kind: 'inheritedTrad', owner: 'A' }] });
  near(hc(r.rows, 2), 11148.4, 1e-6, 'case 14 year 2: min(4,620; 120,000: 1,148.40)');
  assert.strictEqual(r.rows[2].irmaaAppealYearA, 2028);
  near(hc(r.rows, 3), 11148.4, 1e-6, 'case 14 year 3: min(4,620; year 2: 1,148.40; year 3: 1,148.40)');
  assert.strictEqual(r.rows[3].irmaaAppealYearA, 2028);
```

1c. Case 13 (convergence) and case 15 (the 162(l) deduction), appended after 1b:

```js
  // Case 13: an in-year candidate on a drawing year converges to the charge at the realized MAGI (round 1, S3). Single,
  // 66, salary 200,000 retiring at 67 (E = 1), traditional IRA 1,500,000, no pension. The salary surplus of year 0 stays in
  // cash and pays part of the first retired year, so the spending must be high for year 1 to draw into tier 1: at 120,000
  // year 1's realized MAGI is about 117,551 (measured in the plan review), inside tier 1 and at least $100 from 109,000 and
  // 137,000.
  const SPEND = 120000;
  r = await run({ singlePerson: true, ageA: 66, retireAgeA: 67, lifeExpectancyA: 85, incomeA: 200000, incomeKindA: 'wages', tradIraA: 1500000, spending: SPEND });
  const m1 = r.rows[1].magiProxy;
  assert(Math.min(Math.abs(m1 - 109000), Math.abs(m1 - 137000)) >= 100 && m1 > 109000 && m1 < 137000, `case 13 precondition: year 1 MAGI ${m1}`);
  near(hc(r.rows, 1) - 10000, 1148.4, 1e-6, 'case 13 year 1: the charge at the realized MAGI (tier 1), not the normal 4,620');
  assert.strictEqual(r.rows[1].irmaaAppealYearA, 2027);
  near(hc(r.rows, 2), 11148.4, 1e-6, 'case 13 year 2: appealed (tier 1), below the normal 14,620');
  assert(r.rows[2].irmaaAppealYearA !== undefined, 'case 13 year 2: appealed');

  // Case 15: the 162(l) deduction in an appeal year (round 1 S4, round 2 S2). Case 4 without its pension plus a
  // self-employed stream (owner A, ages 60-80, plan rate 0): after 68 no employer coverage, so the premiums are deductible.
  const SELF = (amount) => ({ amount, startAge: 60, endAge: 80, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, profitSharingPct: 0 });
  const trace = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        // __test_accountTrace / __test_simulate re-plan for a new state (the plan's own runs also count in magiStats), so the
        // counter is read around one raw run only (plan review round 1, S2).
        const tr = window.__test_accountTrace();
        const rows = window.__test_simulate().rows;
        const s0 = { ...window.__test_magiStats };
        window.__test_simulateRaw();
        const s1 = { ...window.__test_magiStats };
        return JSON.parse(JSON.stringify({ d: tr.map((x) => x.profile.seHealthA), rows, alt: s1.seAlternative - s0.seAlternative }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...QUIET, ...patch });
  const S15 = { ...S200, retireAgeA: 68 };
  let f = await trace({ ...S15, incomeSources: [SELF(80000)] });
  for (const y of [2, 3]) {
    near(hc(f.rows, y), 10000, 1e-6, `case 15 year ${y}: appealed to 0 (MAGI 80,000 - 5,651.80 - 10,000 = 64,348.20)`);
    near(f.d[y], 10000, 1e-6, `case 15 year ${y}: deduction 10,000`);
  }
  // The feedback variant: MAGI before the deduction X = 0.92935 x profit in (119,000, 120,148.40]; profit 128,700: X =
  // 119,607.35. No consistent deduction exists in years 2 and 3 (the in-year charge flips at 109,000), so each takes the
  // alternative calculation: held deduction 10,000, charge tier 1 (X - 10,000 = 109,607.35 > 109,000).
  f = await trace({ ...S15, incomeSources: [SELF(128700)] });
  for (const y of [2, 3]) {
    near(hc(f.rows, y), 11148.4, 1e-6, `case 15 variant year ${y}: healthcare`);
    near(f.d[y], 10000, 1e-6, `case 15 variant year ${y}: held deduction`);
  }
  assert.strictEqual(f.alt, 2, 'case 15 variant: the alternative calculation in years 2 and 3');
  for (let y = 0; y < f.rows.length; y++) assert(f.d[y] <= hc(f.rows, y) + 1e-6, `case 15 variant year ${y}: deduction ${f.d[y]} above the premium ${hc(f.rows, y)}`);
```

If case 13's precondition fails at SPEND 120,000, stop and report the measured MAGI (the plan review measured 117,551). If case
15's variant gives `alt` other than 2 or values other than those above, stop and
report the trace (do not tune the profit to make it pass): it would mean the 162(l) block meets the in-year candidate
differently than spec 5.4 reasons.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/irmaa_appeal.js`. Expected: FAIL at case 1's `hc(c1, 3)` (`6148.4 vs 5000`). Record the output.

- [ ] **Step 3: Implement**

3.1. Just below `irmaaAppealTable`, add:

```js
  // E3 (spec 5.2): partner P's appeal window in premium year `year` from P's event row: 2 when an event's E is last year
  // (last year's and this year's MAGI may replace the lookback), 1 when it is this year (this year's MAGI), else 0.
  function irmaaAppealWindow(ev, year) {
    return year >= 1 && ev[year - 1] !== 0 ? 2 : ev[year] !== 0 ? 1 : 0;
  }
  // E3 (spec 5.2, round 1 M4): the kind of the event the chosen tax year s can cite in premium year t.
  function irmaaAppealKind(ev, t, s) {
    return s === t - 1 ? ev[t - 1] : ev[t] !== 0 ? ev[t] : ev[t - 1];
  }
  // E3, test-only (plan review round 2, S1): how many times healthcareCost priced an in-year appeal candidate.
  let irmaaInYearCalls = 0;
```

3.2. `healthcareCost` parameters: after `marriedAtDeath = false,` add `appeal = null,`, `irmaaSsH = 0,`, `ssA = 0,`,
`ssB = 0,`, `irmaaStA = 'single',`. Replace the whole IRMAA block (from the comment `// IRMAA applies only to partners
actually on Medicare` through the closing brace of the `else` branch, just above `const ltc =`) with:

```js
    // IRMAA applies only to partners actually on Medicare (see above), using the two-year lookback of Medicare's MAGI
    // (irmaaHistory: only the taxable part of Social Security) on the tiers of the lookback return's filing status (E3 decision
    // 1). A lookback year with two returns charges each person on their own MAGI against the single tiers.
    // E3 (spec 5.3): in an appeal window (appeal.eventA/B), a partner whose normal charge is above 0 is charged the lowest of
    // it, this year's MAGI (this pass's estimate: usesMagiEstimate) and, when the event's E was last year, last year's realized
    // MAGI; a candidate is used only when strictly lower. Year 0 without entered prior MAGIs is skipped: its stand-in already
    // reads this year's MAGI.
    const split = twoReturnHistory ? irmaaLookbackSplit(irmaaHistoryA, irmaaHistoryB, twoReturnHistory, year) : null,
      lookbackMagi = split ? 0 : irmaaLookbackMagi(irmaaHistory, year),
      lbFiling = split ? 'single' : irmaaLookbackFiling(irmaaFilingHistory, year, filing, deathYear, marriedAtDeath),
      canAppeal = appeal !== null && (year > 0 || state.irmaaPriorKnown);
    let appealA = -1,
      appealB = -1,
      inYearA = false,
      inYearB = false;
    if (medicareEligibleA) {
      let ia = irmaaSurcharge(split ? split[0] : lookbackMagi, lbFiling, year);
      const w = canAppeal && ia > 0 ? irmaaAppealWindow(appeal.eventA, year) : 0;
      if (w !== 0) {
        inYearA = true;
        usesMagiEstimate = true;
        irmaaInYearCalls++;
        let best = ia;
        if (w === 2) {
          const s = year - 1,
            last = twoReturnHistory && twoReturnHistory[s] ? irmaaSurcharge(irmaaHistoryA[s], 'single', year) : irmaaSurcharge(irmaaHistory[s], irmaaFilingHistory[s], year);
          if (last < best) (best = last), (appealA = s);
        }
        const now = twoReturns ? irmaaSurcharge(irmaaMagiOf(magiA, ssA, irmaaStA), 'single', year) : irmaaSurcharge(irmaaMagiOf(magiProxy, irmaaSsH, filing), filing, year);
        if (now < best) (best = now), (appealA = year);
        ia = best;
      }
      healthcare += ia;
      if (twoReturns) premA += ia;
    }
    if (medicareEligibleB) {
      let ib = irmaaSurcharge(split ? split[1] : lookbackMagi, lbFiling, year);
      const w = canAppeal && ib > 0 ? irmaaAppealWindow(appeal.eventB, year) : 0;
      if (w !== 0) {
        inYearB = true;
        usesMagiEstimate = true;
        irmaaInYearCalls++;
        let best = ib;
        if (w === 2) {
          const s = year - 1,
            last = twoReturnHistory && twoReturnHistory[s] ? irmaaSurcharge(irmaaHistoryB[s], 'single', year) : irmaaSurcharge(irmaaHistory[s], irmaaFilingHistory[s], year);
          if (last < best) (best = last), (appealB = s);
        }
        const now = twoReturns ? irmaaSurcharge(irmaaMagiOf(magiB, ssB, 'single'), 'single', year) : irmaaSurcharge(irmaaMagiOf(magiProxy, irmaaSsH, filing), filing, year);
        if (now < best) (best = now), (appealB = year);
        ib = best;
      }
      healthcare += ib;
      if (twoReturns) premB += ib;
    }
```

Exactness check before running anything: with `appeal === null` (or `w === 0`), each branch computes
`irmaaSurcharge(<the same MAGI>, <a filing on the same IRMAA_TIERS row>, year)` and adds it in today's order (A then B,
`healthcare +=` then `premA +=`). Today's split branch passed `'single'` explicitly: `lbFiling` is `'single'` there. Do not
reorder or merge the two partners' code.

Change the return to `return { healthcare, ltc, usesMagiEstimate, premA, premB, appealA, appealB, inYearA, inYearB };`.

3.3. Year loop. Move the statement `const irmaaSsH = irmaaSsOf(profile), irmaaStA = twoReturns ? returnStatusA(profile.dependents) : 'single';`
(~11361) up to just before `const hcArgs = {` (unchanged text). In `hcArgs`, after the Task 1 fields, add `appeal,`,
`irmaaSsH,`, `ssA: profile.ssA || 0,`, `ssB: profile.ssB || 0,`, `irmaaStA,`.

Right after `if (usesMagiEstimate) estUsed = true;` (just below `const hcOut = healthcareCost(hcArgs);`), add:

```js
        // E3 (spec 5.5, 5.6): the year's appeal result for the row (reset after a forced pass, below; never read from lastCost,
        // which the plan's probes and the 162(l) search overwrite) and the in-year flags for the plan's lines (independent of
        // the pass's MAGI).
        let appealYrA = hcOut.appealA,
          appealYrB = hcOut.appealB;
        const inYrA = hcOut.inYearA,
          inYrB = hcOut.inYearB;
```

In the forced pass, right after `healthcare = realizedCost;` add `appealYrA = lastCost.appealA; appealYrB = lastCost.appealB;
// E3: the charge actually kept` (the `costAt` call on the line above is the one that set `lastCost`).

3.4. The row: right after the `if (twoReturns) { row.magiA = ...; row.magiB = ...; }` block, add:

```js
        // E3 (spec 5.6): a year whose IRMAA charge an appeal lowered (flat scalars, only in those rows: historical_parity
        // compares non-numbers with !==).
        if (appealYrA >= 0) {
          row.irmaaAppealYearA = taxYearOf(appealYrA);
          row.irmaaAppealKindA = irmaaAppealKind(appeal.eventA, year, appealYrA);
        }
        if (appealYrB >= 0) {
          row.irmaaAppealYearB = taxYearOf(appealYrB);
          row.irmaaAppealKindB = irmaaAppealKind(appeal.eventB, year, appealYrB);
        }
```

3.4b. Next to `window.__test_inhNoDrawCalls = ...` (~17778) add the test hook, in the same style:
`window.__test_irmaaInYearCalls = (reset) => { const n = irmaaInYearCalls; if (reset) irmaaInYearCalls = 0; return n; };`

3.5. `tests/bench_runs_interleaved.js`: add the option (spec 7, round 2 minor 6). After `const STATES = ...` add:

```js
// --household appeal (E3): a single person, 66, salary 200,000 retiring at 67 (E = 1, Medicare from 67, a normal IRMAA
// charge above 0 from the year-0 salary), traditional IRA 1,500,000, spending 120,000 (draws in years 1 and 2); simulate()
// at the household's own ages (the default sweep's 55-62 would put the retirement before today and remove the event).
const HOUSEHOLD = opt('--household', 'default');
const APPEAL_PATCH = {
  singlePerson: true, ageA: 66, retireAgeA: 67, lifeExpectancyA: 90, incomeA: 200000, incomeKindA: 'wages', tradIraA: 1500000,
  spending: 120000, survivorEnabled: false, incomeSources: [], oneTimeIncome: [],
};
```

Pass `[code, HOUSEHOLD === 'appeal' ? APPEAL_PATCH : null]` into `page.evaluate` instead of `code`; inside, destructure
`([code, patch])`, apply `if (patch) Object.assign(st, patch);` before `st.stateTax = code;`, and time
`patch ? simulate(67, 67) : simulate(55 + (i % 8), 55 + ((i >> 3) % 8))` in the loop. Update the usage comment and the
usage error line with `[--household appeal]`. The printed line prefix becomes `US ${code} ${HOUSEHOLD}` only when
`HOUSEHOLD !== 'default'` (keep today's output unchanged otherwise).

- [ ] **Step 4: Run the tests**

`node tests/irmaa_appeal.js` -> ok. Run `node tests/irmaa_magi.js`,
`node tests/irmaa_startup.js`, `node tests/irmaa_gating.js`, `node tests/medicare_enrollment.js`,
`node tests/two_return_magi.js`, `node tests/se_health.js`, `node tests/inherited_accounts.js`,
`node tests/historical_parity.js`, `node tests/survivor_symmetry.js`, `node tests/cliff_plan.js`, `node tests/cliff_guard.js`,
`node tests/solver_hooks.js`, `node tests/tax_caches.js`. **Two existing tests fail by design** (plan review round 1, S1;
both pin a retiree charged on their last salary years, which the appeal changes): `tests/irmaa_gating.js` (~57: expects a
surcharge of 6,355.20 at 69, gets 0) and `tests/medicare_enrollment.js` case 4 (~86: expects 11,355.20 at 70, gets 5,000). Do
not edit them in this step; list them in the report with the before/after numbers. Any other failing existing test: stop and
report.

- [ ] **Step 5: Movers table (stage 2a) and the anchor**

`git -C ../fp-e3-prev checkout --detach <Task 2's commit>`. Run the movers commands. Expected rule: every mover has a
non-null event table (check by re-running the scenario's state through `window.__test_simulate().irmaaAppeal` if in
doubt) and a partner on Medicare in E or E+1 with a normal charge above 0; its first changed year is an E or E+1 of one of
its events. Canada identical. `node tests/plan_off_anchor.js --base ../fp-e3-prev`: the guard-off movers are this same
rule's. Run the timing gate (three runs) and the appeal-household measurement (three runs; not a gate).

- [ ] **Step 6: STOP for the owner's approval**

Report the movers table (expected about 21 US movers: retirement or survivor scenarios, first change at E or E+1), the two
existing-test changes from Step 4, the anchor result (expected 21 different, the same scenarios), the timing gate's tables
and the appeal-household measurement (for the owner's sign-off). Do not update or commit until the owner
approves in writing.

- [ ] **Step 7: After approval: update, re-base the anchor, commit**

`npm run snapshot:update` (changed keys = the approved movers; `ui_us.json` unchanged). Update `tests/plan_off_anchor.js`'s
header with this task's counts against Task 2's commit. Update the two existing tests to the appeal (they keep testing the
same household, now with its appealed charge):
- `tests/irmaa_gating.js`: in the comment block just above the working-years loop (it begins "Working at 66-68: no Medicare,
  ..."), keep that first sentence and replace everything from "Retired at 69 (index 3): enrolls," to the end of the block
  with: "Retired at 69 (index 3): enrolls. The lookback is year 1's MAGI (~$350k of
  wages), but the household appeals for the work stoppage (form SSA-44; E3): year 3's own MAGI (no wages) is under the first
  tier, so no surcharge in its first two Medicare years (69, 70)." Replace the surcharge assertion with
  `assert(Math.abs(surcharge) < 0.01, 'the appeal removes the surcharge in the first Medicare year (surcharge ' + surcharge + ')');`
  and add `assert.strictEqual(rows[3].irmaaAppealKindA, 2, 'the appeal cites the retirement');`. Update the final
  `console.log` text to "... applies once on Medicare, appealed after the work stoppage".
- `tests/medicare_enrollment.js` case 4: the comment becomes "IRMAA only for partners on Medicare: no surcharge while
  working; after retirement the two-year lookback would charge it on the earlier wages, but the household appeals for the
  work stoppage (form SSA-44; E3), so the first retired year pays the premium only."; the assertion becomes
  `near(at(rows, 70).healthcare, 5000, 'first retired year: premium only (the appeal replaces the wages two years back)');`
  and add `assert.strictEqual(at(rows, 70).irmaaAppealKindA, 2, 'case 4: the appeal cites the retirement');`.

Run both files, then `npm test` green, `npm run check:shared` OK. Commit:

```bash
git commit -m "E3 Task 3: the appealed IRMAA charge (spec 5.3-5.6: in-year and last-year candidates in healthcareCost, usesMagiEstimate, row fields), bench --household appeal; us.json: the owner-approved stage-2a movers; irmaa_gating and medicare_enrollment case 4 updated to the appeal; plan_off_anchor re-based" -- Planner_US.html tests/irmaa_appeal.js tests/bench_runs_interleaved.js tests/plan_off_anchor.js tests/snapshots/us.json tests/irmaa_gating.js tests/medicare_enrollment.js
```

---

### Task 4: The cliff plan's IRMAA lines in appeal years (decision 7; stage 2b movers)

**Files:**
- Modify: `Planner_US.html`: `magiThresholds` (~9617-9648, the IRMAA block's two-return branch); the year loop's
  `magiThresholds` call (~11805).
- Modify: `tests/irmaa_appeal.js`, `tests/snapshots/us.json` (after approval).

**Interfaces:**
- Consumes: Task 3's year-loop locals `inYrA`, `inYrB`.
- Produces: `magiThresholds` reads optional `c.irmaaGrowthA` / `c.irmaaGrowthB` (default `c.irmaaGrowth`) in its two-return
  branch.

- [ ] **Step 1: Write the failing test**

Append (case 16, spec 8; round 2 S1):

```js
  // --- Stage 2b: the plan's IRMAA lines on this year's edges (spec 5.5; case 16) ---
  // Inflation 3%; single, 66, salary 200,000 retiring at 68, no pension, traditional IRA 2,000,000. Year 2 has an in-year
  // candidate (normal: year 0's 200,000, tier 3 at year-2 tiers). Lines at growth 1: 109,000 / 137,000 x 1.03^2 =
  // 115,638.10 / 145,343.30. yearPlanCandidates offers the nearest line below the natural MAGI (and the largest step), so
  // SPEND16 puts the natural MAGI between the two. The salary surplus of years 0 and 1 stays in cash and pays part of year 2,
  // so the spending must be high: at 130,000 the natural MAGI is about 133,765 (measured in the plan review; year 3 also has an
  // in-year candidate and its lines also sit at growth 1).
  const SPEND16 = 130000;
  const P16 = { singlePerson: true, ageA: 66, retireAgeA: 68, lifeExpectancyA: 85, incomeA: 200000, incomeKindA: 'wages', tradIraA: 2000000, inflation: 3, spending: SPEND16 };
  const tr16 = await page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return JSON.parse(JSON.stringify(window.__test_planTrace()));
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { ...QUIET, ...P16 });
  const y2 = tr16.find((x) => x.year === 2);
  assert(y2 && y2.candidates, 'case 16: year 2 is a planned withdrawal year');
  const nat = y2.candidates.find((c) => c.kind === 'none').realized;
  assert(nat > 115638.1 && nat < 145343.3, `case 16 precondition: natural MAGI ${nat}`);
  const under = y2.candidates.find((c) => c.kind === 'under' && /IRMAA/.test(c.label));
  assert(under, 'case 16: a stay-under candidate on an IRMAA line in year 2');
  near(under.magi, 115638.1 - 1, 0.01, 'case 16: irmaa1 at growth 1 (the line less $1)');
  // A later year without an in-year candidate (years 4 on: the windows are years 2 and 3) keeps growth irmaaGrowth2 (1.03^2):
  // any IRMAA stay-under there sits at its edge x 1.03^y x 1.03^2 less $1.
  for (const x of tr16.filter((x) => x.year >= 4 && x.candidates))
    for (const c of x.candidates.filter((c) => c.kind === 'under' && /IRMAA/.test(c.label))) {
      const g = Math.pow(1.03, x.year + 2);
      const ok = [109000, 137000, 171000, 205000, 500000].some((e) => Math.abs(c.magi - (e * g - 1)) <= 0.01);
      assert(ok, `case 16 year ${x.year}: IRMAA line ${c.magi} at growth irmaaGrowth2`);
    }
  // Review Focus 5: apply(choose's intents) replays choose on this household (rows identical).
  const replay = await page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      const ch = window.__test_runPlanMode({ planMode: 'choose' });
      const ap = window.__test_runPlanMode({ planMode: 'apply', plan: { intents: ch.intents || {} } });
      return { same: JSON.stringify(ch.rows) === JSON.stringify(ap.rows), n: ch.intents ? Object.keys(ch.intents).length : 0 };
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { ...QUIET, ...P16 });
  assert.strictEqual(replay.same, true, `case 16: apply(choose intents) replays choose (${replay.n} intents)`);
  // Per-return growth (spec 5.5, round 1 M3; plan review round 2, S2): a direct magiThresholds call on two returns with A
  // at growth 1 and B at 1.0609 gives A's lines of an all-growth-1 call and B's lines of an all-1.0609 call, bit for bit.
  // The two returns' MAGIs differ (40,000 / 60,000) so no A line falls within $1 of a B line (magiThresholds merges those).
  const perReturn = await page.evaluate(() => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, { inflation: 0, children: [], acaEnhanced: false, acaEnabled: false });
    const ctx = (extra) => ({
      year: 0, filing: 'single', twoReturns: true, profile: { ownerShareA: 0.5, singlePerson: false, ssA: 0, ssB: 0, dependents: [] },
      preMagi: 100000, preMagiA: 40000, preMagiB: 60000, acaEligibleA: false, acaEligibleB: false, singlePerson: false,
      isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false, workingA: false, workingB: false, age: 66, ageB: 66,
      irmaa: { filing: 'single', a: true, b: true }, ...extra,
    });
    const pick = (lines, ret) => lines.filter((l) => l.family === 'irmaa' && l.ret === ret).map((l) => [l.id, l.magi]);
    try {
      const mixed = window.__test_solver.magiThresholds(ctx({ irmaaGrowth: 1.0609, irmaaGrowthA: 1 })),
        one = window.__test_solver.magiThresholds(ctx({ irmaaGrowth: 1 })),
        two = window.__test_solver.magiThresholds(ctx({ irmaaGrowth: 1.0609 }));
      return { mixedA: pick(mixed, 'A'), oneA: pick(one, 'A'), mixedB: pick(mixed, 'B'), twoB: pick(two, 'B') };
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  });
  assert(perReturn.mixedA.length === 5 && perReturn.mixedB.length === 5, 'per-return growth: five finite IRMAA lines per return');
  assert.deepStrictEqual(perReturn.mixedA, perReturn.oneA, 'per-return growth: A at growth 1');
  assert.deepStrictEqual(perReturn.mixedB, perReturn.twoB, 'per-return growth: B at the household growth');
```

(`window.__test_runPlanMode({ planMode, plan })` (~17646) returns `{ rows, intents, ... }`; `tests/cliff_plan.js` (~225)
uses the same identity. `window.__test_planTrace()` with no argument runs `choose` on the standard projection (~17826); each
entry is `{ year, candidates: [{ kind, magi, realized, label, ... }], ... }`, a stay-under's `magi` being its line less $1
(`underPlanOf`, ~9886).)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/irmaa_appeal.js`. Expected: FAIL at `case 16: a stay-under candidate on an IRMAA line in year 2` or at
`case 16: irmaa1 at growth 1` (today the year-2 `irmaa1` stay-under is at `109,000 x 1.03^4 - 1` = 122,679.46; the plan
review measured the red at this assertion with SPEND16 130,000). If the precondition fails, stop and report the measured
natural MAGI (the plan review measured 133,765).

- [ ] **Step 3: Implement**

3.1. `magiThresholds`, the IRMAA block's two-return branch: today

```js
      if (c.twoReturns) {
        const f = taxIndexFactor(y);
        let k = 0;
        for (const [edge] of IRMAA_TIERS[filingKey('single', 'irmaa')]) {
          const cap = edge * f * g;
          if (cap < Infinity) k++;
          if (irmaaA && cap < Infinity) add(toHousehold(magiForIrmaaLine(cap, p.ssA || 0, stA), c.preMagiA, shareA), 'IRMAA tier', 'irmaa' + k, 'A', 'irmaa');
          if (irmaaB && cap < Infinity) add(toHousehold(magiForIrmaaLine(cap, p.ssB || 0, 'single'), c.preMagiB, 1 - shareA), 'IRMAA tier', 'irmaa' + k, 'B', 'irmaa');
        }
```

becomes (per-return growth; `gA === g` gives the identical double `edge * f * g`):

```js
      if (c.twoReturns) {
        const f = taxIndexFactor(y),
          gA = c.irmaaGrowthA === undefined ? g : c.irmaaGrowthA, // E3 (spec 5.5): per return
          gB = c.irmaaGrowthB === undefined ? g : c.irmaaGrowthB;
        let k = 0;
        for (const [edge] of IRMAA_TIERS[filingKey('single', 'irmaa')]) {
          if (edge < Infinity) k++;
          if (irmaaA && edge < Infinity) add(toHousehold(magiForIrmaaLine(edge * f * gA, p.ssA || 0, stA), c.preMagiA, shareA), 'IRMAA tier', 'irmaa' + k, 'A', 'irmaa');
          if (irmaaB && edge < Infinity) add(toHousehold(magiForIrmaaLine(edge * f * gB, p.ssB || 0, 'single'), c.preMagiB, 1 - shareA), 'IRMAA tier', 'irmaa' + k, 'B', 'irmaa');
        }
```

(`cap < Infinity` was `edge < Infinity`: a finite edge times finite factors is finite.) Add one line to the IRMAA comment
above: "E3: a caller may pass c.irmaaGrowthA / c.irmaaGrowthB (two returns, per return); a year with an in-year IRMAA
appeal candidate passes growth 1 (this year's edges)."

3.2. The call site (~11805): replace `irmaa: { filing, a: medA, b: medB }, irmaaGrowth: irmaaGrowth2,` with

```js
irmaa: { filing, a: medA || inYrA, b: medB || inYrB }, irmaaGrowth: inYrA || inYrB ? 1 : irmaaGrowth2, irmaaGrowthA: inYrA ? 1 : irmaaGrowth2, irmaaGrowthB: inYrB ? 1 : irmaaGrowth2,
```

(`inYrA/B` are the Task 3 locals of the same pass.)

- [ ] **Step 4: Run the tests**

`node tests/irmaa_appeal.js` -> ok. `node tests/cliff_plan.js`, `node tests/cliff_guard.js`,
`node tests/solver_hooks.js`, `node tests/solver_primitives.js`, `node tests/end_value_us.js`, `node tests/irmaa_magi.js`
(its case (c) calls `magiThresholds` directly with `irmaaGrowth: 1`: unchanged) pass.

- [ ] **Step 5: Movers table (stage 2b) and the anchor**

`git -C ../fp-e3-prev checkout --detach <Task 3's commit>`. Movers commands. **Expected: zero movers** on the snapshot grid
(the plan review measured 0: no grid scenario has a planned withdrawal year whose IRMAA lines moved), so `us.json` does not
change and the STOP below is a formality (report the zero table; the owner confirms). Should any mover appear, the rule: a guard-on
scenario with a withdrawal year in which `inYrA || inYrB` holds (an in-year candidate for a partner on Medicare); its first
change is in such a year, in plan-priced fields (`cliffChoice`, the draw split, a conversion), then downstream. Canada
identical. `node tests/plan_off_anchor.js --base ../fp-e3-prev` must report **every scenario identical** (the lines exist
only with the plan on). The timing gate (three runs) and the appeal-household measurement (three runs; not a gate), plus
`node tests/bench_plan.js` (planning at most 5x one off projection) and `node tests/bench_solver.js --base ../fp-e3-base
--rounds 21`.

- [ ] **Step 6: STOP for the owner's approval**

Report the movers table, the anchor result (all identical), SPEND16, the timing and planning tables. Do not update or
commit until the owner approves in writing.

- [ ] **Step 7: After approval: update and commit**

With zero movers (expected) skip `npm run snapshot:update` (`node tests/snapshot.js` passes as is); otherwise run it and
check the changed keys are the approved movers. The anchor header is unchanged (guard-off identical); say so in the commit.
`npm test` green. Commit (add `tests/snapshots/us.json` to the paths only if it changed):

```bash
git commit -m "E3 Task 4: the cliff plan's IRMAA lines on this year's edges in a year with an in-year appeal candidate (per-return growth in magiThresholds); no snapshot mover on the grid; guard-off identical" -- Planner_US.html tests/irmaa_appeal.js
```

---

### Task 5: The tooltip, the copy, README, the badge (V130; no number change)

**Files:**
- Modify: `Planner_US.html`: a new `annotateAppealRows` just below `annotateInheritedRows` (~14339-14352) and its call in
  `render()` after `annotateInheritedRows(selected);` (~12365); the healthcare callout (~713); the `irmaaPriorKnown`
  tooltip (`data-tip` of the `#irmaaPriorKnown` label, ~510); the badge `V129` -> `V130` (~276).
- Modify: `README.md` (the IRMAA bullet, ~110), `tests/snapshots/ui_us.json` (text hashes only).
- Create: `test_irmaa_appeal.js` (repo root, Playwright, not in CI).

**Interfaces:**
- Consumes: Task 3's row fields `irmaaAppealYearA/B`, `irmaaAppealKindA/B`.

- [ ] **Step 1: Write the failing Playwright test**

Create `test_irmaa_appeal.js`:

```js
// E3 UI check (not in CI): the status tooltip names the IRMAA appeal; the healthcare callout says appeals are assumed; no
// horizontal overflow at 390px. Run: node test_irmaa_appeal.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  for (const width of [1280, 390]) {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    const saved = {
      singlePerson: true, ageA: 66, retireAgeA: 68, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages', incomeGrowth: 0,
      k401PctA: 0, catchupPctA: 0, iraPctA: 0, pensionCoverage: 'a', pensionYearlyA: 60000, pensionStartAgeA: 68, stateTax: 'tx',
      acaEnabled: false, inflation: 0, medicalInflation: 0, medicareYearly: 10000, ssMonthlyA: 0, spending: 20000, tenure: 'rent',
      rent: 0, taxable: 0, cash: 0, tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0,
    };
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['fireCouplePlanner.massachusettsOffline.v1', JSON.stringify({ state: saved, mode: 'real' })]);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
    await page.waitForTimeout(500);
    const title = await page.evaluate(() => {
      for (const tr of document.querySelectorAll('#projectionRows tr'))
        if (tr.cells[0] && tr.cells[0].textContent.trim() === '68') return (tr.querySelector('.table-status') || {}).title || '';
      return null;
    });
    assert(title !== null, 'the table has a row for age 68');
    assert(/IRMAA appeal \(form SSA-44, retirement\)/.test(title), `tooltip at 68: ${title}`);
    assert(/2028 income instead of 2026/.test(title), `tooltip years: ${title}`);
    // The callout sits inside the closed <details id="methodologyCard">: innerText would miss it (plan review round 1, S4).
    const callout = await page.evaluate(() => document.getElementById('methodologyCard').textContent);
    assert(/form SSA-44/.test(callout), 'the healthcare callout mentions the appeal');
    assert(!/Medicaid coverage gap/.test(callout), 'the stale Medicaid phrase is gone');
    if (width === 390) assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'no horizontal overflow at 390px');
    assert.deepStrictEqual(errors, [], `page errors at ${width}`);
    await page.close();
  }
  await browser.close();
  console.log('test_irmaa_appeal: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

(If the table does not list age 68 by default, open the full table first: read `renderTable`'s year list (inside the
shared region; read only) and the table's own toggle, and do what `test_inherited_accounts.js` does to reach a row.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node test_irmaa_appeal.js`. Expected: FAIL at `tooltip at 68` (empty title).

- [ ] **Step 3: Implement**

3.1. Below `annotateInheritedRows`:

```js
  // E3: the status cell also names an IRMAA appeal (form SSA-44) where one lowered a partner's charge (appended to the title;
  // US only, renderTable is shared).
  const APPEAL_EVENT = ['', 'end of a job', 'retirement', "spouse's death"];
  function annotateAppealRows(sim) {
    for (const tr of document.querySelectorAll('#projectionRows tr')) {
      const age = Number(tr.cells[0] && tr.cells[0].textContent),
        r = sim.rows.find((x) => x.age === age),
        cell = tr.querySelector('.table-status');
      if (!r || !cell || (r.irmaaAppealYearA === undefined && r.irmaaAppealYearB === undefined)) continue;
      const was = taxYearOf(r.year - 2),
        parts = [];
      for (const P of ['A', 'B']) {
        const used = r['irmaaAppealYear' + P];
        if (used === undefined) continue;
        const who = state.singlePerson ? 'the surcharge' : `Partner ${P}'s surcharge`;
        parts.push(`IRMAA appeal (form SSA-44, ${APPEAL_EVENT[r['irmaaAppealKind' + P]]}): ${who} uses ${used} income instead of ${was}`);
      }
      const note = parts.join(' · ');
      cell.title = cell.title ? `${cell.title} · ${note}` : note;
    }
  }
```

and in `render()` after `annotateInheritedRows(selected);` add `annotateAppealRows(selected);`.

3.2. The healthcare callout (~713): replace its last sentence, "Neither ACA nor IRMAA account for the Medicaid coverage gap,
state ACA variations, or IRMAA appeals for life-changing events.", and in the IRMAA sentence just before it replace
"matching Medicare's actual two-year lookback." with "matching Medicare's actual two-year lookback, on the tiers of the
filing status of that earlier return." Then add: "After a retirement, the end of a job or a spouse's death inside the plan,
the household is assumed to file Medicare's appeal for a life-changing event (form SSA-44): in the first one or two
Medicare years after the event the surcharge uses that year's (or the year before's) income instead, when that is lower.
Other life-changing events (marriage, divorce, a lost pension or property) and state ACA variations are not modeled."

3.3. The `irmaaPriorKnown` `data-tip` (~510): append " A retirement, the end of a job or a spouse's death inside the plan
is appealed automatically (form SSA-44)." (inside the attribute; an apostrophe is `&#x27;`, as elsewhere in that tip).

3.4. Badge: `V129` -> `V130` in the `<h1>` span (~276).

3.5. README.md, the IRMAA bullet (~110, begins "- Medicare IRMAA surcharge modeling"): append before its last sentence
("Optionally enter your MAGI ..."): " The lookback uses the tiers of the filing status on that earlier return (a survivor's
first two years after the death are charged on the joint tiers of the couple's joint returns). After a retirement, the end
of a W-2 or self-employed job, or a spouse's death inside the plan, the household is assumed to file the IRMAA appeal for a
life-changing event (form SSA-44): in the first one or two Medicare years after the event the surcharge uses that year's
(or the year before's) income when that is lower; the year table's status tooltip says when. Marriage, divorce and the loss
of a pension or property are not modeled as appeals. " (note the leading space before "The lookback" and the trailing space
before "Optionally", so the sentences do not run together).

- [ ] **Step 4: Run the tests**

`node test_irmaa_appeal.js` -> ok. `node tests/snapshot_ui.js`: expect a failure on text hashes / lengths of `<main>` only
(the callout); run `node tests/snapshot_ui.js --update` and confirm with `git diff tests/snapshots/ui_us.json` that only text
hashes and lengths changed (no wiring entry, no MCP schema entry). `node tests/snapshot.js` passes (no number change).
`npm test` green.

- [ ] **Step 5: Commit**

```bash
git add test_irmaa_appeal.js
git commit -m "E3 Task 5: the IRMAA appeal in the status tooltip (annotateAppealRows), the healthcare callout (appeals assumed; the stale Medicaid phrase dropped) and the prior-MAGI tooltip, README, V130; ui_us.json: callout text hashes only; test_irmaa_appeal.js" -- Planner_US.html README.md tests/snapshots/ui_us.json test_irmaa_appeal.js
```

---

### Task 6: CLAUDE.md, the implementation record, the final gates (no number change)

**Files:**
- Modify: `CLAUDE.md`, `docs/next-batches-plan.md` (a new "E3: implementation (US V130)" record right after the "E3:
  design" record; touch no other heading: another chat may be editing E4's).

- [ ] **Step 1: CLAUDE.md**

1a. In "MAGI iteration (both engines)", just before `Test: \`tests/aca_magi_iteration.js\`. Test: \`tests/irmaa_magi.js\`.`
(~290), insert a paragraph (write it to a file and insert with node; no backticks in shell strings):

**IRMAA appeal and the lookback's filing status (US, E3).** The household lookback charges on the tiers of the lookback
return's filing status (`irmaaFilingHistory`, written once per year before `hcArgs`; `irmaaLookbackFiling`: years 0 and 1
read year 0's status, except an entered prior return from before a married partner's death, which is joint), so a survivor's
D+1 and D+2 are on the joint tiers. `irmaaAppealTable` (per run; `null` for most runs) records each person's usable events by
first post-event year E (a main-job retirement, the end of a W-2 or self-employed stream, a married spouse's death; covered:
the owner, the spouse when married in E; kept for a covered person alive in E and 65 by E+1). In `healthcareCost`, a partner
on Medicare whose window is open (`irmaaAppealWindow`) and whose normal charge is above 0 is charged the lowest of the normal
charge, this year's MAGI (the pass's estimate, so it sets `usesMagiEstimate` and converges within `MAGI_ITER_TOL`; `costAt`,
the forced pass, the 162(l) search and the inherited need adjustment price it unchanged) and, in year E+1, last year's
realized MAGI; year 0 without entered prior MAGIs is skipped. The year loop keeps `appealYrA/B` (set from `hcOut`, and again
after the forced pass's `costAt`; never read from `lastCost`) for the row's `irmaaAppealYearA/B` / `irmaaAppealKindA/B`, and
`inYrA/B` for the cliff plan, whose IRMAA lines sit on this year's edges (growth 1, per return through
`c.irmaaGrowthA/B`) in a year with an in-year candidate. The plan's `irmaaAt`, lines and `irmaaChecks` use this year's
filing status (the return SSA will read); `irmaaFiling2` is gone. Test: `tests/irmaa_appeal.js`.

1b. In the "Files" list, after the `tests/two_return_magi.js` mention or next to the IRMAA tests in the `tests/aca_medicaid.js`
bullet, add: "`tests/irmaa_appeal.js` — E3: the lookback's filing status and the IRMAA appeal (form SSA-44), hand-computed;
`test_irmaa_appeal.js` (Playwright, not in CI) covers the status tooltip and the callout." Also note under
`tests/bench_runs_interleaved.js` the `--household appeal` option (one clause).

- [ ] **Step 2: The implementation record**

In `docs/next-batches-plan.md`, after the "E3: design" record (it ends with the round-2 paragraph), add
"##### E3: implementation (US V130)": the commits (hash and one line each), the red-then-green record per task, the
three movers tables as approved (verbatim), the anchor re-bases, every timing table verbatim (Tasks 1, 3, 4 and Step 3
below), the two corrections to spec section 8 listed at the top of this plan, any
existing test whose expectation changed
(`irmaa_gating.js`, `medicare_enrollment.js` case 4, with the owner's approval), the tooltip wording's departure from spec 5.6,
the appeal-household timing measurement (for the owner's sign-off), the one path no test reaches (the forced pass's reset of
`appealYrA/B` from `lastCost`, spec 5.6: no constructed household takes the forced pass inside an appeal window),
the `ui_us.json` hashes that moved in Task 5, and
anything left for the owner.

- [ ] **Step 3: Final gates**

`npm test` green; `npm run check:shared` OK; `node tests/irmaa_appeal.js`; `node test_irmaa_appeal.js`; the timing gate
against `../fp-e3-base` (three runs, at most +5% per path) and the appeal-household measurement (three runs, recorded for the
owner's sign-off); `node tests/bench_plan.js`;
`node tests/bench_solver.js --base ../fp-e3-base --rounds 21`; `node tests/plan_off_anchor.js --base ../fp-e3-prev` with
`fp-e3-prev` at Task 4's commit (all identical). Record the tables in the record (Step 2).

- [ ] **Step 4: Commit**

```bash
git commit -m "E3 Task 6: CLAUDE.md (the lookback's filing status, the appeal table and charge, the plan's lines), the E3 implementation record, final gates" -- CLAUDE.md docs/next-batches-plan.md
```
