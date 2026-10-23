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
  current share of the pool), the penalty blend uses the traditional share for traditional draws and
  the Roth share (`accountsOwnerShareA(accts.roth)`) for `rothPenaltyFraction`, and a partner's RMD /
  72(t) amount is drawn from that partner's own accounts (`accountsDraw`; a single person or the
  survivor owns everything, so the draw is pro rata and no share moves). Roth conversions come from the
  IRAs first. (To check against the code: the penalty-blend clause above is stale; `rothPenaltyFraction` no longer
  exists in `src/`, and the penalty status is in `src/us/core/accounts/penalty-status.js`.)

## Contribution limits and profit sharing

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
