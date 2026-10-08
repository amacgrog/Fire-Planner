# E1a: employer-plan contribution limits and profit sharing (US) — design

Date: 2026-10-08. Owner decisions from the brainstorm of this date. Base: `4df6e02` on `claude/batch-3b-penalty-rules`
(US V121). US only; Canada untouched; no shared-region change.

## 1. Where this sits

Batch E1 ("income character", `docs/next-batches-plan.md`, Batch E) is split into four sub-batches, each with its own
spec, plan and review, in this order (owner, 2026-10-08):

- **E1a (this spec):** employer-plan limits and profit sharing, W-2 only; the income inputs become typed fields.
- **E1b:** income streams get an owner (Partner A / B) and a kind (not earned / W-2 wages): payroll tax, the ACTC's earned
  income, the owner's return.
- **E1c:** full self-employment, for the main income and for streams: self-employment tax with its half deduction, the
  qualified business income deduction (with the specified-service rules), the self-employed health insurance deduction
  inside the MAGI iteration, and a Solo 401(k) (deferral, the employer contribution at 25% of compensation figured after
  half the SE tax and the contribution, after-tax money where the plan allows it). Facts already established for it: the
  415(c) limit applies per unrelated employer while the 402(g) deferral limit is per person across plans, so a W-2 job
  plus a side business gets a second annual-additions limit but shares one deferral limit; the employer part alone fills
  $72,000 only at about $237,500 of compensation after half the SE tax, so after-tax money matters below that.
- **E1d:** one-time income tax treatments (tax-free, ordinary, long-term gain with a gain share, inherited traditional
  IRA / 401(k) drawn evenly over 10 years).
- **E1-CA (later, near the Canada province move):** the Canada port of E1a to E1d. See section 7.

**Generality rule (owner):** the US is built now, but the engine pieces are written so Canada can plug in: mechanics as
pure functions over passed-in rules and data tables, country-neutral state keys, and a "Canada port" section in each
E1 spec.

## 2. What is wrong or missing today (`retirementContributions`, `Planner_US.html` ~line 8078)

1. **Catch-up counted against the annual-additions limit.** The mega-backdoor room is
   `min(W, 72,000f) - min(k, base + catch-up) - match`, where `k` includes the catch-up. Catch-up contributions are not
   annual additions (IRC 414(v); IRS, "Failure to limit contributions for a participant"), so the total limit is
   $72,000 plus the catch-up ($80,000 at 50-59 and 64+, $83,250 at 60-63). Today a partner aged 50+ gets $8,000 (or
   $11,250) less mega-backdoor room than the law allows.
2. **The match is never limited.** `matchA = W x match%` (year loop, ~line 9910): no 415(c) limit and no compensation
   limit. IRC 401(a)(17) counts at most $360,000 of pay (2026, Notice 2025-67) for a percentage-of-pay contribution.
3. **No profit sharing.**
4. **Income tops out at $350,000** (`#incomeA` / `#incomeB` are range sliders, `max="350000"`); the wizard's income box
   has no maximum, so a wizard entry above $350,000 can be clamped back by the slider.

Here `f` is the existing `limitFactor`: the plan's assumed inflation compounded from 2026 (standard projection,
`factor`) or the path's actual inflation (historical and Monte Carlo, `cumFactor`). Every limit below is a 2026 figure
times `limitFactor`.

## 3. Inputs and display

- **Partner A / B income: a money field**, not a slider: `class="money"` (formatted in place, digits stripped when read,
  per `CLAUDE.md` "Money-field formatting"), no maximum. Same label, descriptor and payroll-tax tooltip; the `incomeAOut` /
  `incomeBOut` labels are removed. The `FIELDS` entries keep `type: 'number'` (same key, MCP property and estimate badge;
  drop `out` / `outSync`). No `normalizeState` change: it never clamped the income (the slider did), a money field cannot hold a negative, and old saves load unchanged. The
  markup is US-only (just after the shared `html-timelineGroupState` region). Any test that drives these controls as
  sliders is updated to type into the field.
- **New per-partner field, "Employer profit sharing (% of pay)"**: keys `profitSharingPctA` / `profitSharingPctB`,
  a number box like the match (`min="0" max="25" step="0.5"`), default 0, right after each partner's match; B's hidden in single-person mode as B's match is. Descriptor:
  "Employer contribution to the traditional 401(k)". Tooltip (from what the engine does): an employer contribution as a
  percentage of pay; only pay up to the IRS compensation limit counts ($360,000 in 2026, indexed); it shares the annual
  limit ($72,000 in 2026, indexed; catch-up contributions are outside it) with your deferrals, the match and after-tax
  money, and is reduced when they would exceed it; 25% is the most an employer can deduct across its payroll and the
  usual ceiling for an owner-employee. Registered in `FIELDS` (`type: 'number'`, like the match), in
  `ESTIMATE_ALWAYS_IDS` like `matchA/B`, clamped 0 to 25 in `normalizeState`. Exposed through MCP (every numeric field is).
- **Match tooltip:** add that only pay up to the compensation limit counts and that the match shares the annual limit.
- **Mega-backdoor tooltip:** the room is the annual limit less your deferrals (not the catch-up), the match and profit
  sharing, and never more than your pay.
- No new results card. Contributions already reach the rows and the Sankey; profit sharing joins the match there.
- US badge bump; README feature line; `CLAUDE.md` ("Retirement accounts (US)") note.

## 4. The contribution math

### 4.1 Limits as data

A pure-literal table `PLAN_LIMITS` just above `retirementContributions`, one entry per limit, each with its 2026 value
and source (all indexed by `limitFactor`, as today):

| Key | 2026 | Rule |
|---|---|---|
| `deferral` | 24,500 | 402(g) elective deferral limit |
| `catchUp50` | 8,000 | 414(v) catch-up, age 50+ (and 64+) |
| `catchUp60to63` | 11,250 | SECURE 2.0 enhanced catch-up, ages 60-63 |
| `annualAdditions` | 72,000 | 415(c)(1)(A); also limited to 100% of compensation |
| `compensation` | 360,000 | 401(a)(17) |
| `rothCatchUpWages` | 150,000 | SECURE 2.0 mandatory Roth catch-up wage threshold (as today) |
| `ira` / `iraCatchUp` | 7,500 / 1,100 | IRA limit and its 50+ catch-up (as today) |

`retirementContributions` reads the table; no limit literal stays in its body. Values are unchanged from today's
literals, so moving them changes no number.

### 4.2 The allocator (country-neutral, shared-ready)

`allocatePlanRoom(room, amounts, out)`: fills `room` with `amounts[0]`, `amounts[1]`, ... in order, writing to `out[i]`
`min(amounts[i], room left)` and returning the room left. Pure: reads no `state`, no US names, allocates nothing (the
caller passes a reusable `out` array; `retirementContributions` runs every year of every projection). At E1-CA it moves
unchanged into a `shared/` fragment. Not in a shared region in E1a.

### 4.3 Per working partner (wages `W`, 0 once retired)

1. Deferrals as today: `kBase = min(W, deferral) x deferral%`; the catch-up as today (age bands, `catchupPct`, the
   Roth catch-up rule).
2. `room = max(0, min(W, annualAdditions) - kBase)`. The catch-up is not subtracted (the fix of 2.1).
3. `comp = min(W, compensation)`.
4. Requests in the order a plan operates (owner decision, below): match `comp x match%`, then profit sharing
   `comp x profitSharing%`; `allocatePlanRoom(room, [match, profit], out)`.
5. Mega backdoor: `room left x mega%` when on, as today.

**Order (owner decision, option A).** Deferrals as elected (their own limit always fits under the annual limit), then
the match, then profit sharing, then the mega backdoor. The IRS correction order for an excess already made (refund
after-tax money, then unmatched deferrals, then matched deferrals with the match forfeited, then forfeit profit sharing;
IRS, "Fixing common plan mistakes: failure to limit contributions for a participant") is for unwinding a mistake; a plan
in operation limits after-tax money to the room left and stops the employer allocation at the room after deferrals. The
model keeps the deferrals the user chose (they set the Roth / traditional split and this year's taxable wages).

### 4.4 Where the money goes

- Match and profit sharing: pre-tax employer money into that partner's traditional 401(k) (account ledger slot 401(k) A
  or B, as the match today). No payroll tax, no income tax, no change to wages or MAGI.
- Mega backdoor: the Roth 401(k), as today.
- `retirementContributions` returns the limited `matchA/B` and `profitA/B` (and the per-account `acct` dollars, as
  today); the year loop stops computing `matchA/B` itself (wages are already 0 for a retired partner and for B in
  single-person mode, so pay-based amounts are 0 there); `employerMatch` (the loop's
  employer total, used by `routeSurplus`, `bal.traditional` and the ledger) becomes match + profit sharing. No new
  balance, scalar or ledger state: the MAGI-iteration snapshot is untouched. The cliff plan, lambda and the optimizer
  see the change through the balances; no hook changes.

## 5. Expected movers (intended number change, commit 3)

- **(a) Catch-up:** partners 50+ with the mega backdoor on: more Roth 401(k), by up to the catch-up, less surplus to
  taxable.
- **(b) Compensation limit:** wages above `360,000 x limitFactor` with a match (wage growth faster than inflation can
  cross it in later years even below today's $350,000 slider cap).
- **(c) Match cut to the room:** the match is limited to the room left under the annual limit (the lesser of
  $72,000f and 100% of pay, less deferrals): low wages with deferrals already filling pay, or a match percentage that
  exceeds the room. The snapshot scenario `default megaBackdoor+match` enters `matchA: 5000, matchB: 3000` (percent,
  so 50x and 30x pay today): it moves heavily into this group, and its mega backdoor, 0 today, stays 0.

Any mover outside (a)-(c) stops the work. Profit sharing defaults to 0, so it moves nothing by itself.

**Earlier depletion.** (b) and (c) remove employer money the planner gives today in error. If a standard snapshot
scenario runs out earlier because of them, the implementer stops and reports it (scenario, ages, the money removed);
the owner decides case by case (reviewer's recommendation: accept as a correctness fix). (a) only moves money between
accounts; an earlier depletion there stops the work like any other.

## 6. Tests and gates

- Hook `window.__test_retirementContributions(args)` and `window.__test_allocatePlanRoom(room, amounts)` in the US-only
  test hooks.
- `tests/contribution_limits.js` (in `npm test`), hand-computed, `limitFactor` 1 unless stated:
  - catch-up outside the limit: 55, wages 200,000, deferral 100%, no match, mega 100%: deferral 24,500, catch-up 8,000,
    mega 47,500 (today 39,500: fails before the fix); at 61: catch-up 11,250, mega 47,500;
  - compensation limit: wages 500,000, profit sharing 10%: 36,000; match 10%: 36,000;
  - order: wages 300,000, deferral 100%, match 6%, profit sharing 25%: deferral 24,500, match 18,000, profit sharing
    29,500, mega 0;
  - 100% of pay: wages 20,000, deferral 100%, match 50%: match 0;
  - indexing: `limitFactor` 1.1 scales every limit;
  - single-person mode zeroes B; a retired partner gets nothing;
  - the allocator: in order, partial fill, zero room, and a Canada-shaped list (employer DPSP and group match ahead of
    the employee's RRSP in one room) to show the core carries no US assumption;
  - engine: profit sharing lands in the right partner's traditional 401(k) (`__test_accountTrace`); rows' `tax`,
    `magiProxy` and payroll tax identical at profit sharing 0% and 10%; the traditional balance rises by exactly the
    contribution.
- `tests/field_registry.js` passes with the new keys; `tests/legacy_state.js`: new corpus saves (no profit-sharing key
  gives 0; an income above 350,000 is kept); `tests/account_ledger.js` checked for the limited match.
- `test_contribution_limits.js` (committed, Playwright): typing $500,000 into Partner A income keeps it and changes
  the rows; the profit-sharing slider changes `window.fireProjectionRows`; no horizontal scroll at 390 x 844.
- Snapshots: commit 1 changes the UI snapshot only (`node tests/snapshot_ui.js --update`, said in the commit; restore any
  file rewritten with no content change); commit 3 is the number change: dump/compare against the base
  (`node tests/snapshot.js --root <base worktree> --dump A --update-nothing`, `--dump B`, `--compare A B`), a movers table
  grouped (a), (b), (c), `npm run snapshot:update` in the same commit. Every other commit leaves the snapshots identical.
- Timing: `tests/bench_runs_interleaved.js --base <base> --rounds 21` and `tests/bench_solver.js --base <base>`, +5%
  per path.
- No shared-region or Canada change; `npm run check:shared` passes.

## 7. Canada port (E1-CA)

What carries over unchanged: `allocatePlanRoom` (into a `shared/` fragment), the state keys `matchA/B` (new in Canada)
and `profitSharingPctA/B` (a DPSP in Canada), the money-field income inputs (Canada's `#incomeA/B` are sliders too,
per planner markup). What Canada supplies: its own limits table (RRSP 18% of earned income to the dollar limit, the
money purchase limit, the DPSP limit of half of it, TFSA, FHSA) and its room computation, which differs from the US in
kind (prior-year earned income, the pension adjustment reducing next year's RRSP room, carry-forward room). Today
Canada has no employer contributions at all (`Planner_Canada.html` ~line 4917). E1-CA designs the room against
Canadian law before building it.

## 8. Not modeled (stated in tooltips or notes)

Roth employer contributions (SECURE 2.0 section 604); two unrelated employers per partner (two 415(c) limits);
a true-up or match formulas other than a flat percentage of pay; the 404(a)(3) aggregate deduction limit (the 25%
slider bound stands in for it); contributions after leaving an employer.

## 9. Commits

1. Income inputs become money fields (UI snapshot updated; no number change).
2. `PLAN_LIMITS`, `allocatePlanRoom`, the test hooks, and `tests/contribution_limits.js` with the cases that hold on
   today's math (no number change: the limits move to data with the same values; `npm test` green).
3. The limit math and profit sharing (the fix; movers table; `snapshot:update`; badge bump). The cases that need the
   fix (catch-up, compensation limit, order, 100% of pay, profit sharing) are added here, each shown to fail on commit
   2's tree before the fix.
4. README, `CLAUDE.md`, notes in `docs/next-batches-plan.md` (E1a notes; E1-CA and E1b-d recorded), and E1's carried
   item: reword the comment above the Task 3 invariant in `tests/cliff_plan.js` ("plus the plan refreshCliffPlan
   stores": the test checks the `choose` intents only).
