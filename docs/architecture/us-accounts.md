# US retirement accounts, contributions and penalties

Read before touching the account inputs, the account ledger, contribution limits, RMD / 72(t) sizing or the early-withdrawal penalty.

Related: [engine.md](engine.md), [magi-iteration.md](magi-iteration.md), [self-employment.md](self-employment.md), [lists.md](lists.md), [us-state-tax.md](us-state-tax.md).

## Retirement accounts and the account ledger

- **Retirement accounts (US).** Four accounts per partner: `tradIraA/B`, `trad401kA/B`,
  `rothIraA/B`, `roth401kA/B` (all `.money`), plus `rothIraBasisA/B` (dollars; **0 means "not entered"**
  and the engine assumes `ROTH_BASIS_ASSUMED_PCT` = 50% of the balance, enter 1 for none) and
  `roth401kBasisPctA/B` (slider, default 50). The snapshot grid and `tests/historical_rates.js` use the
  planner's own basis defaults (so they run at 50%); hand-computed tests pin 100% through
  `translateFieldList` / `pinBasis`. `openingAccounts()` reads them (Partner B's are zero in
  single-person mode: B's balances are ignored, not summed); `bal.traditional/roth` start as the sums.
  The old pooled `traditional`, `roth`, `traditionalSharePctA` and `rothBasisPct` are retired and **not
  migrated** (owner decision): `normalizeState` deletes them, so an old save opens with default
  accounts. Under the pooled `bal.traditional + bal.bondTraditional` and `bal.roth + bal.bondRoth` sits
  the **account ledger** (`accts`, `accountsNew/Contribute/Convert/Clone/Restore`): each account's
  SHARE of its pool in `ACCOUNT_SLOTS` order `[IRA A, 401(k) A, IRA B, 401(k) B]` (Roth pool: Roth IRA A,
  Roth 401(k) A, Roth IRA B, Roth 401(k) B). Growth, ladder/refill moves and draws are pro rata and
  leave shares alone; only a contribution (to the owner's account; employer match to the traditional
  401(k), mega-backdoor to the Roth 401(k)) or a Roth conversion (IRAs first, then 401(k)s, into the
  same partner's Roth IRA) changes them. The ledger is cloned/restored with the MAGI-iteration snapshot
  (`accountsClone/Restore`, next to `rothLedgerClone/Restore`): a new mutable ledger must be added
  there in the same commit. `window.__test_accountTrace` returns per-year account balances.
  The engine reads the ledger: RMD and 72(t) sizing use `accountsOwnerShareA(accts.trad)` (A's
  current share of the pool), and a partner's RMD / 72(t) amount is drawn from that partner's own
  accounts (`accountsDraw`; a single person or the survivor owns everything, so the draw is pro rata and
  no share moves). Roth conversions come from the IRAs first.
  There is no blended penalty fraction: the 10% is decided per account (`src/us/core/accounts/penalty-status.js`).
  Each year `accountStatuses` (`account-ledger.js`) gives each of the four slots `penaltyStatus(kind, ownerAge,
  { rule55 })`: `free` (no 10%: the owner is 59½ or older, or the slot is a 401(k) and `rule55Applies`) and
  `qualified` (59½ or older, so Roth earnings are tax-free too); a deceased partner's accounts in the survivor
  period are free and qualified, and the traditional and Roth accounts of a slot share its status. A discretionary
  traditional draw takes one group at a time (`tradGroup(wd, penalized)`: the slots with that `free` flag, minus
  SEPP slots, pro rata inside the group), and the traditional solvers (`solveTraditionalForNet`,
  `solveTraditionalForNetFromNeed`) charge 10% of the whole draw for a penalized group and nothing otherwise. A Roth draw is split per account by `rothSlotSplit` (`roth-ledger.js`):
  a Roth IRA pays basis first, then conversions still inside their five years, then earnings; a Roth 401(k) pays
  earnings pro rata; the 10% falls on the conversions and earnings of a non-free account, income tax on the
  earnings of a non-qualified one. While some money would be penalized (`hasPenalizedMoney`), the strategies draw
  penalty-free money only (`rothFreeCaps`: an early Roth IRA up to its basis, an early Roth 401(k) nothing), in a
  changed order (cash and the bond reserve before Roth basis; the `*_PENALIZED_ORDER` lists in `strategies.js`), and
  leave the rest to `takePenalized` (`draws.js`). It runs after the inherited-account last resort (`takeInherited`) and
  just before home equity, and repeatedly takes the cheapest source per gross dollar (tax plus 10%), one source at a
  time: the penalized traditional group (both partners, pro rata) or a single Roth account. Every draw that takes a group
  of accounts (the penalty-free traditional group in `takeTraditional`, the split draw's one partner, `fillTraditional`, the
  free Roth room of `rothFreeCaps`, the mix weights' `freeTrad`, and each `takePenalized` source) sizes its room in a bucket
  as its accounts' whole dollars, never more than the bucket (`groupRoom`, `penalty-status.js`), not their share of the
  bucket: the shares are shares of the pool (stock + bond bucket) and the ledger renormalizes them after each draw, so once a
  group that is only part of the pool had drawn from one bucket, its share of the other understated what it held. In
  `takePenalized` the cheapest source then never emptied, the passes ran out and the year fell through to home equity with
  penalized money left (fixed in V144); in the penalty-free draws a stock call then a bond call left free money undrawn, which
  went to penalized money or home equity (fixed in V145). An early Roth IRA's free room is its basis, in whichever bucket is
  drawn. The rooms of several Roth accounts can add up to more than the bucket; `rothDraw` caps the draw at the bucket.
  Forced amounts (RMD, 72(t)) never pass through this and are never penalized.

## Workplace-plan coverage and the IRA deduction (IRA deduction PR 2)

- **Coverage is inferred per partner from the 401(k) slot.** `retirementContributions` returns `coveredA/B`: true when any plan
  money lands in that partner's 401(k) slot of the year's contributions (`acct.trad[1] + acct.roth[1] > 0` for A, slots 3 for
  B): a traditional or Roth deferral, the catch-up, the match, profit sharing, the mega backdoor, or a `self` stream's Solo
  401(k) deferral. It also returns the year's traditional IRA dollars (`iraTradA/B`, the IRA slots of the contributions) and
  each partner's 219(b) limit (`iraLimitA/B`, catch-up at 50, times `limitFactor`).
- **The gap: a defined-benefit-only participant is not detected.** 219(g)(5) counts a pension accrual as coverage, but the
  planner's pension inputs are payouts, not accruals, so a partner whose only workplace plan is a defined-benefit pension
  reads as uncovered and keeps the full deduction (or reads the spouse range).
- The deduction itself (the ranges, the reduction, the 219(g) MAGI and the add-back into the year's income) is in
  [us-federal-tax.md](us-federal-tax.md) and [magi-iteration.md](magi-iteration.md). The year's nondeductible dollars
  (`iraNd_p`) become that partner's basis at the year end (below).

## Traditional IRA basis in the year loop (PR 2)

- **The slider and the opening basis.** `tradIraBasisPctA/B` (0-100, default 0, clamped in `normalizeState`) is the share of
  each partner's opening traditional IRA balance that is after-tax basis (old nondeductible contributions, Form 8606 line 14).
  `iraBasisOpening(inputs)` gives `[tradIraA x pct, tradIraB x pct]` (B 0 for a single person). 401(k)s carry no basis here.
- **The ledger.** `iraBasis` (`[A, B]`, `iraBasisOpening`, `src/us/core/accounts/ira-basis.js`) is created per run next to
  `accts`; `iraBasis[0]` / `[1]` are in `scalarSnapshot`. A year that starts with basis (`basisOn`) fixes each partner's ratio
  `iraRatio` on the grown IRA (start-of-year shares times the grown pool; deviation 4) before the passes. Without basis
  nothing below runs: every taxable fraction is exactly 1 and `rmdTaxA/B` are `rmdA/B`.
- **The ratio rule** (deviation 4). `iraBasisRatios` sets `ratio_p = min(1, basis_p / IRA_p)` (0 for an empty IRA), once a year,
  on the partner's grown IRA dollars and the basis at the start of the year. Every outflow from that IRA that year (draws, the
  RMD, the 72(t) payments and the conversions) is tax-free in that ratio. Form 8606 puts the year's nondeductible contribution
  in the numerator and the year-end value in the denominator; the planner adds the year's contribution only at the year end,
  so it first counts in the next year's ratio. The 401(k) dollars in a pooled draw are fully taxable: a group's taxable fraction
  is `1 - sum(ratio_p x IRA_p) / group dollars` (`groupTaxableFraction`).
- **Draws.** A group draw's taxable fraction is `drawTaxableFraction(wd, slots)` (`groupTaxableFraction` on the shares;
  `wd.iraRatio` is null outside a basis year). `traditionalGross` and `cappableTraditional` take the taxable part,
  `traditionalWithdrawn`, the bucket and the ledger the gross; the solvers price `traditionalGross + mid * taxableFrac` and
  charge the 10% as `(fromTrad * taxableFrac) * 0.1 * penalizedFraction`. The MAGI cap and the fill are taxable rooms (the
  gross is the room over the fraction; at 0 the cap does not bind and the fill draws nothing). The split draw updates
  `attrA` / `ownerShareA` with taxable dollars.
- **RMD and 72(t).** The tax-free part per partner is the ratio times the IRA dollars in that partner's draw (each IRA's own
  72(t) payment, then the RMD pro rata over the partner's own accounts, or over the whole pool for a single person or a
  survivor), replaying the ledger steps before `buildTaxProfile`, which takes the taxable `rmdTaxA/B`. The row's `rmd`, the
  cash and the pool keep the gross; `row.rmdTaxable` is the taxable sum.
- **The year end** (`iraBasisYearEnd`, before the contributions in both cash branches, when `basisOn || iraAdd > 0`):
  `iraBasis[p] -= ratio_p * (grown IRA_p - IRA_p now)` (the draws, the RMD, the 72(t) payments and the conversion: every IRA
  dollar out), then `+= iraNd_p`. It never resets basis to the ratio times the balance, so basis above a fallen balance carries
  forward (8606 line 14). Rows: `iraBasis` (A + B at the year end) and `iraBasisRecovered`.
- **Conversions (Task 5b), the one rule.** In a basis year `conversionAmount` is the **taxable** conversion: every reader of it
  (tax, MAGI, the records and replays, `natConv`, the `=== 0` controls, the phased cap, the bond-ladder pricing, `totalIncome`)
  is unchanged. `convGross` (the row's `conversionGross`, only in a basis year) is the dollars moved:
  `conversionGross(iraRatio, convDollars, seppActive, conversionAmount)` after the phased cap, so an all-basis IRA segment
  converts whole even at a taxable 0. `applyRothConversion` and the `stateReadsK401` preview take the gross. `convDollars` (the slot
  dollars after growth, the 72(t) payments and the RMD) are computed once a year before the passes with
  `accountsConvertPreview(..., 0, seppActive)`, the third replay of the ledger steps. Every comparison of a conversion with the
  convertible balance reads `convertibleT = conversionTaxable(iraRatio, convDollars, seppActive, convertible)`: the fill's cap,
  the sized path, `ceilRead`, the held and zero kinds, the secant bound (`convertibleTr`) and the choice's candidates and lines.
  An amount-map year (`rothAmountByAge`, test-only) takes its gross from the map and taxes `conversionTaxable` of it. The choice's
  bridge check moves `conversionGross` of each candidate less the year's gross. The cliff plan's reach (`hi`) is MAGI, so it reads
  the taxable conversion; `canFill` is `freeTraditionalFills` (false for an all-basis penalty-free group, which adds no MAGI).
- **The Roth ledger.** `applyRothConversion(..., iraRatio)` reads `CONV_TAKEN` (accountsConvert's per-slot dollars, a scratch) and
  pushes per partner a taxable entry `{ year, amount, free: false }` and then the tax-free one `{ year, amount: ratio_p x IRA
  dollars taken, free: true }` (`rothAccountsConvert(R, to, year, free)`; `free` null pushes the old single entry, and an entry
  without the flag is taxable). `rothAccountsSeason` seasons both; `rothSlotSplit`'s `penaltyBase` counts only taxable
  conversion dollars (oldest first); `rothFreeCaps` adds the free entries ahead of the first unseasoned taxable one
  (408A(d)(4)(B)). The UI readers of the conversion as money moved (the cash-flow chart's `cashFlowParts`, the schedule card in
  `roth-optimizer.js`) read `conversionGross ?? conversionAmount`.
- **The estate.** `estate.traditionalBasis` is the basis left, each partner's capped at that partner's IRA dollars of the final pool (basis
  carried above a fallen IRA never shelters 401(k) or inherited dollars); `endTaxUS` taxes only `traditional - traditionalBasis`, and
  `afterTaxEndValueUS` adds the gross. The cliff plan's `lambdaEstimate` and `phaseScore` ignore basis.

## Contribution limits and profit sharing

- **Contribution types are per partner.** `k401TypeA/B` and `iraTypeA/B` (`traditional` or `roth`; each a `FIELDS` choice with
  fallback `traditional`, eight buttons `k401TraditionalBtnA` ... `iraRothBtnB`, the B ones `data-partner-b`) replace the
  household `k401Type` / `iraType`; `normalizeState` copies an old household value to both partners and deletes the old key.

- **Contribution limits and profit sharing (US, E1a).** `PLAN_LIMITS` (2026 values: the $72,000 annual limit, the
  catch-ups outside it, the $360,000 compensation limit; indexed by `limitFactor`) and `allocatePlanRoom(room, amounts,
  out)` (pure, country-neutral, allocation-free; in `src/us/core/income/contributions.js`, to move to `src/shared/core/` at E1-CA) sit above `retirementContributions`, which
  returns the limited `matchA/B`, `profitA/B` and `employerContrib` (the year loop's `employerMatch`). One room per
  partner is filled in the order deferrals, match, profit sharing, after-tax (mega backdoor); the room is
  `min(pay, annual limit) - deferrals` (catch-ups outside it); the mega backdoor is further capped at pay less deferral and catch-up (the employee's own money never exceeds pay); match and profit sharing count pay only up to the compensation limit. `profitSharingPctA/B` (0-25, clamped in
  `normalizeState` and while typing) is the employer's share of pay into the traditional 401(k). Partner income
  (`incomeA/B`) is a money field, not a slider. Optional `min` / `max` on a `FIELDS` number entry bound MCP input only (`mcpAccepts`, US-only; profit sharing 0-25). Test: `tests/unit/us/contribution-limits.test.js`.

## Early-withdrawal penalty (no Canada equivalent)

- US models a 10% early-withdrawal penalty (`ruleOf55A`/`ruleOf55B`: Rule of 55
  elected per partner, covering that partner's 401(k)s only through
  `rule55Applies(inputs, working, retireAge, partner)`; an old save's household
  `ruleOf55Enabled: true` ticks both in `normalizeState`,
  `sepp72tEnabledA`/`sepp72tEnabledB`, `singleLifeDivisor(age)`) on
  traditional/bondTraditional withdrawals before 59.5; Canada has no
  equivalent to build, since RRSP/RRIF withdrawals carry no age-based
  penalty at any age (only withholding tax, already captured via
  `taxFor()`) — don't port this feature to Canada.

## Per-partner shares of the pooled traditional balance

- `traditional`/`bondTraditional` are one pooled household balance (not
  separate per-partner accounts), but RMDs, the 72(t)/early-withdrawal
  penalty fraction, and 72(t) SEPP sizing all need to know each partner's
  own share of that pool. Since Batch 3A that share comes from the account
  inputs (see "Retirement accounts and the account ledger" above); `traditionalShareA`/
  `traditionalShareB` (computed fresh each loop year in both
  `simulate()`/`simulateHistorical()` from `traditionalBeforeRmd * pctA`/
  `* (1 - pctA)`) are used everywhere RMD/SEPP/penalty math reads it. During survivor period or
  single-person mode, both shares collapse to the full pooled balance
  (ownership stops being split once there's only one living partner) —
  whichever partner's RMD doesn't apply gets zeroed immediately after via
  the existing `isSurvivorPeriod`/`deceasedIsA` guard. `sepp72tEnabledA`/`sepp72tEnabledB` are independently
  toggleable (an old single `sepp72tEnabled` boolean is migrated
  in `normalizeState()`) since a real 72(t) SEPP
  plan is elected per account, not per household — enabling it for one
  partner doesn't require or affect the other's. Canada has no equivalent
  needing this split (no RMD-style age-based mandatory distribution
  penalty, no 72(t)).
- **The split draw (Batch 5 step 4d).** A discretionary traditional draw is pro rata across the penalty-free accounts of both
  partners (`tradGroup`), so each return carries `ownerShareA` (the start-of-year ledger share) of the year's traditional income.
  In a two-return year the cliff plan's split lever can draw one partner's penalty-free accounts first (`wd.splitFirst`,
  `wd.onlyPartner`), then the other's; the year's `profile.ownerShareA` is then the realized share (A's drawn dollars over the
  year's traditional gross), and `k401DrawFracA/B` are unchanged (a partner's free accounts are drawn in the pro-rata proportions,
  D8). The ledger's own shares follow the dollars actually drawn, so the next year's `ownerShareA` reflects the split. A year is
  splittable only when both partners hold penalty-free traditional money at the withdrawal's start (`freeOf`), so a partner under
  59.5 without Rule of 55 is never split. The estate's end tax uses the start-of-year share of its last year
  ([engine.md](engine.md)). Details: [cliff-plan.md](cliff-plan.md), "The split stage".
