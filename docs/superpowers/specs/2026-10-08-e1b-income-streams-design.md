# E1b: income stream owner, W-2 kind and stream contributions (US); salary stops at death (both) — design

Date: 2026-10-08. Owner decisions from the brainstorm of this date. Base: `71451fd` on `claude/batch-3b-penalty-rules`
(US V122, Canada V58). US only, except the death-age fix (section 6), which is made in both planners. One shared-region
change, decided: a `select` field kind in `shared/23-dynFieldHtml.js` (section 2.2).

## 1. Where this sits

E1 is split into E1a (done, V122) -> **E1b (this spec)** -> E1c (full self-employment) -> E1d (one-time income
treatments), plus E1-CA later (E1a spec section 1). E1b gives income streams (`state.incomeSources`) an owner and a kind,
lets a W-2 stream contribute to retirement accounts, and stops a deceased partner's salary at death.

**Generality rule (owner):** mechanics as pure functions over passed-in rules, country-neutral state keys, and a Canada
port section (section 9).

## 2. Today (`Planner_US.html` at `71451fd`)

- `listAmountsForYear` sums every active stream into one `extraIncome`, windows tested on Partner A's age.
- The year loop adds it to `wages` (cash). `buildTaxProfile` adds it to `otherA` (and the survivor remap carries it to
  the survivor's slot). `taxFor` adds it to the state's `sources.wages` (`extra`) on A's return in all three branches.
- `payrollTax` and the ACTC's earned income (`childCredits(..., profile.wageA [+ wageB])`) see only the main salaries.
- Consequences: a stream B owns lands on A's return in two-return years (and in `returnMagis`); no stream pays payroll
  tax or counts as earned income; no stream can fund a 401(k) or IRA.
- Separately, `workingA = age < retireAgeA` ignores death (same line in Canada, `Planner_Canada.html` ~5720): a partner
  who dies before their retirement age keeps drawing salary in cash, and the survivor remap drops it from the tax
  profile, so it is untaxed cash. Snapshot scenario `std R work past 65 survivor` (A dies at 67, retires at 68) has it.

## 3. Decisions (owner, 2026-10-08)

1. **Approach:** one pure function splits the streams by owner and kind (section 5.1); the household total stays the
   cash figure.
2. **Age window:** the owner's age (labels "Starts at age" / "Ends at age", short text "Owner's age").
3. **Death:** a W-2 stream stops in its owner's death year; a not-earned stream continues to the survivor and is taxed
   on the survivor's return; its window keeps counting the deceased's age (calendar years).
4. **Display:** owner and kind are dropdowns; a `select` kind is added to the shared list renderer.
5. **W-2 streams may contribute to retirement accounts** (reopened question 3): a per-stream checkbox opening a panel:
   401(k) type, 401(k) contribution, employer match, after-tax (mega backdoor) Roth, IRA contribution. In E1c
   self-employment streams get profit sharing in the same panel.
6. **The deceased's main salary stops at death**, in both planners, in one commit.
7. **Backlog (not built):** a pre-tax health premium on stream wages.
8. No interim self-employment warning in the tooltip (nobody uses the tool between E1b and E1c); self-employment is the
   third kind in E1c.

## 4. Inputs and stored state (US)

### 4.1 Stream row (`DYN.incomeSources`)

| Field | Key | Values / range | Default | Shown when |
|---|---|---|---|---|
| Owner | `owner` | `'A'` / `'B'` (Partner A / Partner B) | `'A'` | not single-person mode |
| Kind | `kind` | `'other'` (Not earned) / `'wages'` (W-2 wages) | `'other'` | always |
| Annual amount, growth | as today | | | |
| Starts at age / Ends at age | `startAge` / `endAge` | as today; short text "Owner's age" / "Owner's age; last year received" | | |
| Contribute to retirement accounts | `contribute` | checkbox | `false` | kind `wages` |
| 401(k) type | `deferralType` | `'traditional'` / `'roth'` | `'traditional'` | kind `wages` and `contribute` |
| 401(k) contribution (% of the room left) | `deferralPct` | 0-100 | 0 | same |
| Employer match (% of this pay) | `matchPct` | 0-100 | 0 | same |
| After-tax (mega backdoor) Roth (% of this employer's room left) | `afterTaxPct` | 0-100 | 0 | same |
| IRA contribution (% of the IRA room left) | `personalPct` | 0-100 | 0 | same |

- Toggling single-person mode re-renders the stream list so the owner field appears or disappears (`showIf` reads
  `state.singlePerson`).
- Kind tooltip: "W-2 wages: pay from an employer. It pays Social Security and Medicare tax (sharing the owner's wage
  base with their salary), counts as earned income for the child tax credit, is taxed on the owner's return, and can
  fund the owner's 401(k) and IRA (tick Contribute to retirement accounts). It does not change Medicare or ACA
  eligibility or the main job's contributions. It stops in the owner's death year. Not earned (rent, an annuity,
  alimony): no payroll tax; it continues to the survivor."
- Panel tooltips say what section 5.4 does: the 401(k) contribution shares the person's yearly deferral limit with
  their salary (the salary is filled first); the match and after-tax money use this employer's own annual-additions
  limit; the IRA shares the person's IRA limit; the IRA type is the household's IRA choice.
- List tip: drop "attributed to Partner A".
- `fresh()`: `{ amount: 0, startAge: 65, endAge: 75, followGrowth: true, growth: defaults.incomeGrowth, owner: 'A',
  kind: 'other', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0,
  personalPct: 0 }`.

### 4.2 Shared renderer (`shared/23-dynFieldHtml.js`; owner decision 4)

A field may declare `kind: 'select'` with `options: [[value, label], ...]`. `dynFieldHtml` draws
`<select id data-dyn-i data-dyn-k>` with the stored value selected; the `change` listener stores the value string for a
select (as it does `checked` for a checkbox). Synced to both planners (`npm run sync`, then CRLF, per `CLAUDE.md`).
Canada declares no select, so its markup, state and snapshots are unchanged.

### 4.3 Normalization

`normalizeUsStreams(s)` (US-only, outside every shared region), called in `normalizeState` right after the shared
`normalizeLists`: `owner` is `'B'` only if literally `'B'`, else `'A'`; `kind` is `'wages'` only if literally
`'wages'`, else `'other'`; `contribute` only if literally `true`; `deferralType` `'roth'` only if literally `'roth'`,
else `'traditional'`; the four percentages clamped 0-100 (non-numbers 0). A stored `'B'` is kept in single-person mode
(switching it off restores it); the engine reads it as A (section 5.1). Canada's normalized state does not change.

Not touched: MCP (lists are not exposed), the CSV export, the cash-flow totals.

## 5. Engine (US)

### 5.1 `streamAmountsForYear(streams, ctx, out)`

Pure: reads no `state`, no US names. Replaces the stream part of `listAmountsForYear`.
- `ctx`: `{ ageA, ageB, deadA, deadB, single, year, factor, incomeFactor }`. `ageB` is `state.ageB + year` even after
  B's death. `deadX` is `year >= deathYear` for that partner (the same test that starts the survivor remap).
- Per stream, in list order: owner = A in single-person mode, else the stored owner; the window is tested on the owner's
  age; amount = `s.amount * itemGrowthFactor(s, year, 'income', factor, incomeFactor)` (as today).
  - kind `wages`: skipped if the owner is dead; else added to `out.wagesA/B`, and, if `contribute`, recorded for
    section 5.4 (index and amount in a fixed-size scratch, at most `LIST_MAX`).
  - kind `other`: added to `out.otherA/B`; if the owner is dead, to the survivor's bucket instead.
  - `out.total`: one running sum of every included amount in list order (today's `extraIncome` expression, so the cash
    flow is bit-identical for the same streams).
- `out` is module-level scratch (no allocation per year).

### 5.2 Year loop, `buildTaxProfile`, `taxFor`, `payrollTax`

- `extraIncome = out.total` feeds `wages` (cash) as today. `wageA/B`, `retirementContributions`' salary math, health
  premiums, `workingA/B`, Medicare and ACA eligibility keep the main salary only.
- `buildTaxProfile`: `profileWageX = max(0, wageX - traditionalContribX - healthPremiumX) + max(0, streamWagesX -
  streamTraditionalX)` (section 5.4; the second term is exactly 0 for a legacy save); `otherX = profileWageX + pensionX + rmdX + streamOtherX` (for A this is today's
  term order with the stream amount where `extraIncome` was). The profile carries `extraA` / `extraB` (not-earned
  amounts) instead of `extraIncome`. Survivor remap (A deceased): B's slot moves to A as today; A's not-earned streams
  are already in B's bucket (5.1), so the old `+ extraIncome` goes. B deceased: B's not-earned streams were rerouted to
  A, so the single branch (slot A only) taxes them. `LAMBDA_PROFILE` gets `extraA: 0, extraB: 0`.
- `taxFor`: joint branch `extra = extraA + extraB` (computed first, added once where `extra` is today); single branch
  `extraA`; two-filer branch: A's return `extraA`, **B's return `extraB`** (`sourcesB.wages = profile.wageB + invB +
  extraB`). W-2 stream wages reach the state's `wages`, the ACTC and the lagged federal pass through
  `profile.wageA/B` with no new code. `returnMagis` splits correctly because `otherB` holds B's streams.
- `payrollTax({ ..., streamWagesA, streamWagesB })`: `taxableX = max(0, wageX - healthPremiumX) + streamWagesX`, so each
  person's Social Security wage base and the Additional Medicare Tax threshold are shared with their salary. Deferrals
  do not reduce payroll wages (as for the salary).
- No new row fields (a new field would change every snapshot hash); payroll tax is already inside `tax`.

### 5.3 Exactness

For a legacy save (every stream `owner 'A'`, `kind 'other'`, no contribution) every new term is `+ 0` or `+ extraB`
with `extraB = 0`, each sum keeps today's order, and adding an exact zero leaves a double unchanged. The engine commits
must leave every existing `us.json` entry byte-identical.

### 5.4 Stream contributions: `streamPlanContributions(...)`

Pure (limits, ages, pay and rates passed in; scratch output; country-neutral names). `retirementContributions` calls
it after the salary math, which is not changed. For each contributing W-2 stream in list order, against its owner's
room (owner A in single-person mode):

1. **Deferral (IRC 402(g): one limit per person across plans).** Room left = `PLAN_LIMITS.deferral x limitFactor` less
   the salary's base deferral and earlier streams' base deferrals; catch-up room left = the person's catch-up
   (`catchUp50` / `catchUp60to63` by age) less the salary's catch-up and earlier streams' catch-ups. The stream defers
   `min(pay, base room left + catch-up room left) x deferralPct`, filled base first (`min(D, base room left)`), the rest catch-up (zero room under 50). Base part: the
   stream's `deferralType`. Catch-up part: Roth if this stream's pay exceeds `rothCatchUpWages x limitFactor` (the line
   is per employer), else `deferralType`.
2. **Annual additions (IRC 415(c): per employer; each stream is treated as its own unrelated employer).** Room =
   `min(pay, annualAdditions x limitFactor) - base deferral` (catch-up outside it). `allocatePlanRoom(room, [match], ...)`
   with match = `min(pay, compensation x limitFactor) x matchPct`. After-tax = `min(room left, max(0, pay - base
   deferral - catch-up)) x afterTaxPct`.
3. **IRA (IRC 219(b): one limit per person).** Room left = the person's IRA limit (`ira` + `iraCatchUp` at 50+, times
   `limitFactor`) less the salary's IRA amount and earlier streams' IRA amounts, and at most the person's total
   compensation (salary + all their W-2 stream pay) less what is already contributed to the IRA. The stream contributes
   `room left x personalPct`, typed by the household `state.iraType`.
4. **Where it goes (existing slots, `ACCOUNT_SLOTS` order):** deferral to the owner's 401(k) (traditional or Roth as
   above); match to the owner's traditional 401(k); after-tax to the owner's Roth 401(k); IRA to the owner's IRA by
   `iraType`. Added to `traditionalContrib` / `rothContrib`, `acct.trad` / `acct.roth` and `employerContrib` (match) as
   `+ streamX` terms after today's sums. `streamTraditionalA/B` (the owner's traditional deferral + traditional IRA from
   streams) lowers income-tax wages (5.2). No new balance, scalar or ledger state: the MAGI-iteration snapshot is
   untouched.

## 6. Salary stops at death (both planners; owner decision 6)

At the top of each `runProjection`, the deceased partner's effective retirement age becomes `min(retirement age,
survivorDeathAge)` (only when survivor planning is on and that partner is the one who dies). Everything keyed on
retirement follows: wages, 401(k)/IRA contributions and health premiums stop; `retirementYear` (the both-retired year:
bond ladder, `firstWithdrawal`), `makeProjectedExpense`, ACA eligibility (the survivor's spouse is no longer working).
The deceased's Medicare is already excluded by the survivor test. The implementer lists every use of `retireAgeA/B`
inside `runProjection` in each planner and states for each that the clamped value is right (or keeps the raw value
with a reason). Number change, its own commit: dump/compare, movers table, `snapshot:update` (both baselines).
Expected mover: `std R work past 65 survivor` (US) and its historical runs; any other mover is listed and explained.
Any scenario that depletes earlier stops the work for the owner's decision (reviewer's recommendation: accept, it
removes untaxed salary paid after death).

## 7. Tests and gates

- `tests/income_streams.js` (new, in `npm test`, hand-computed):
  - the pure function: owner's-age windows; W-2 stops at the owner's death, not-earned moves to the survivor; a stored
    B reads as A in single-person mode; `total` is `Object.is` the old `extraIncome` on a mixed list;
  - payroll: B salary 150,000 plus a 50,000 W-2 stream, Social Security tax capped at B's wage base; a W-2 stream
    pushing the Additional Medicare Tax over its line;
  - ACTC: retired couple, one child, only a 20,000 W-2 stream: refundable part 15% x (20,000 - 2,500); the same stream
    not earned: none;
  - two returns (unmarried): B's stream on B's return, `taxFor` against the two single returns worked by hand,
    `returnMagis`, a per-person state;
  - survivor: A dies holding a W-2 and a not-earned stream (W-2 stops, not-earned taxed on B's return); B dies holding a
    not-earned stream (taxed, not dropped);
  - engine: legacy-shaped states give identical rows with the new keys present or absent.
- `tests/stream_contributions.js` (new, in `npm test`, hand-computed, `limitFactor` 1): salary deferral 100% at 45
  leaves no stream deferral; salary deferral 50% (12,250) leaves 12,250 for a stream at 100%; catch-up at 55 shared;
  stream pay over the Roth catch-up line makes its catch-up Roth; match limited by the stream's own room (low pay);
  after-tax capped at pay less deferral and catch-up; IRA room shared with the salary and capped by total
  compensation; two streams of one owner fill in list order; single-person mode with a stored B goes to A's accounts;
  engine: the dollars land in the right `acct` slots (`__test_accountTrace`), traditional amounts lower `tax` by
  hand-computed amounts and leave payroll tax unchanged.
- `tests/survivor_salary.js` (new, in `npm test`, both planners): A dies at 67 before retiring at 68: from the death
  year A's wages, contributions and health premium are 0; mirror case B; death after retirement unchanged.
- `tests/legacy_state.js`: new US cases (no owner / kind; bad values; stored B in single-person mode; a contribution
  panel with out-of-range numbers). Proof that the normalized states differ only by the new stream keys, then
  `--update` (Canada hashes unchanged).
- `tests/field_registry.js` passes. `snapshot_ui.js --update` for the US (the rows gain controls); Canada's UI snapshot
  unchanged.
- `test_income_streams.js` (Playwright, committed): changing owner, kind and the panel changes
  `window.fireProjectionRows`; the owner select hides in single-person mode; the panel opens only for W-2 with the
  checkbox; no horizontal scroll at 390 x 844.
- New snapshot scenarios (new entries only): B-owned W-2 stream; B-owned not-earned stream on two returns; survivor with
  streams; a contributing W-2 stream with match and after-tax; Canada: a death before retirement.
- Gates: no existing snapshot entry moves except in the death-age commit; `npm run check:shared` passes; timing
  `tests/bench_runs_interleaved.js --rounds 21` (+5% allowed) and `tests/bench_solver.js --rounds 31` (recorded as
  measured), for the death commit and for the tip.

## 8. Commits

1. Death-age fix, both planners (number change: movers table, `snapshot:update`, `tests/survivor_salary.js`; US V123,
   Canada V59).
2. Shared `select` kind; the US stream fields, panel and `normalizeUsStreams`; legacy and UI snapshot updates (the engine
   does not read the new keys yet: no number change).
3. Engine owner and kind (5.1-5.3) and `tests/income_streams.js`; existing snapshots byte-identical; new scenarios.
4. Stream contributions (5.4) and `tests/stream_contributions.js`; existing snapshots byte-identical; new scenario; US
   V124.
5. Docs: README feature lines (both planners' death fix, US streams), `CLAUDE.md` (stream owner, kind and
   contributions; the profile's `extraA/B`; the clamped retirement age), E1b notes in `docs/next-batches-plan.md`.

## 9. Canada port (E1-CA)

Carries over unchanged: `streamAmountsForYear`, the `select` kind, the keys (`owner`, `kind`, `contribute`,
`deferralType`, `deferralPct`, `matchPct`, `afterTaxPct`, `personalPct`), whose normalization then moves into the
shared `normalizeLists`. Canada supplies its own consequences: `payrollItems` (CPP/QPP, EI, QPIP, the Canada employment
amount) on salary plus stream wages per person; `earnedA/B` for the benefits; earned income for RRSP room;
`personalPct` maps to the RRSP; the group plan / DPSP room per Canadian law (E1a spec section 7). Canada has two returns
in every year, so the owner matters every year.

## 10. Not modeled

- Backlog (owner): a pre-tax health premium on stream wages.
- Two W-2 streams of one person from the same employer (each is its own employer for 415(c) and the compensation limit).
- The IRA deduction phase-out for someone covered by a workplace plan, and the Roth IRA income limits (also not modeled
  for the salary).
- Social Security benefits rising with stream earnings, and the earnings test (Batch 6).
- A state treating a not-earned stream as anything but wages (an annuity's retirement exclusion).
- Self-employment (E1c: the third kind, with profit sharing in the panel).
