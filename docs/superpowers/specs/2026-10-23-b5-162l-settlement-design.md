# Batch 5, step 1: settle the 162(l) deduction at the final draws (US) — design

Date: 2026-10-23. Owner decisions from the brainstorm of this date. Base: `d8e3cee` on `main` (US V134). US engine only;
Canada untouched; no new input; no UI change beyond the version badge.

## 1. Where this sits

Batch 5 (the optimizer) is agreed in this order: 0 re-measure the optimizer gap (a parallel session); **1 this settlement**;
2 an objective registry; 3 conversion sizing behind an outer search over `m`; 4 a stored plan plus Apply refinement and
further levers; 5 retire `optimizeMultiLever`. The settlement goes first because it corrects the engine itself, and every
later objective scores the engine's rows. The starting notes are the block "Added 2026-10-09 (owner, E1c review part 5):
settle the 162(l) deduction at the final draws" at the top of "Batch 5: optimizer" in `docs/next-batches-plan.md`. The
background is decisions 9-12 of `docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md` and "Third estimate (US,
E1c)" in `docs/architecture/magi-iteration.md`.

## 2. The problem

The self-employed health insurance deduction (IRC 162(l)) lowers MAGI. MAGI sets the premium tax credit, and the credit
sets the premium the deduction is drawn from. The draws pay for the premium and the tax, so they depend on the deduction,
and the deduction depends on them. In some years there is no point where all three agree.

What the engine does today (`src/us/core/projection/run-projection.js`, the US year loop):

- **A converged year** (the damped MAGI iteration comes within `MAGI_ITER_TOL`) is exact. Nothing in this spec touches it.
- **A held year** (`seHeld`, decisions 10 and 12) does not converge with a deduction allowed. The engine picks a deduction
  once: the consistent one if a bisection finds it (`seKind` 1), else Rev. Proc. 2014-41 section 5.02's (`seKind` 2). It
  prices that deduction on the draws of the pass that failed to converge, then re-runs the year with it held. The re-run's
  draws respond to the held premium, so the year can end with a deduction that is neither consistent nor 5.02's at its own
  final income. This understatement is legal and conservative, but `tests/se_health.js` (invariant grid) counts it:
  hundreds of dollars in many band years and about $12,700 at worst. Decision 11 re-held once at the final draws. It was
  withdrawn (decision 12) because it flipped across the 400% line and deducted more than the premium paid (224 of 8,610
  grid years, worst $12,829).
- **A forced or unresolved year with a deduction allowed but not held.** The forced-pass block recomputes the deduction
  from the premium it charges (`if (!seHeld && (profile.seAllowA || profile.seAllowB))`), and an unresolved year keeps its
  last pass's deduction. Neither is consistent in general. But such a year can only be reached with a step-1 deduction of
  0 (section 6.1), so its deduction is 0 and exact. Once held, a year can still end in the forced pass; that case is a
  held year.

## 3. Goal

Every self-employed year ends exactly legal at its own final income. The return's deduction is the consistent one at the
year's final draws, else section 5.02's at those draws. The return's premium is the cost at the resulting MAGI. The
deduction never exceeds that premium (Treas. Reg. 1.162(l)-1T(a)(1), below). Anything the year paid that differs from
the return is settled the way a real return settles it: in the next year's cash.

Constraints, all from the Batch 5 goal:

- Converged years stay byte-identical. Read this with decision 3:
  - In a run with no settling year, every year is byte-identical.
  - In a run with one, the years after it change: their flow carries the settlement, their seed is the settled deduction,
    and the cliff plan may pick a different family, since its candidates score later rows and the estate.
  - Only E1c runs (a 162(l) deduction allowed) can have a settling year.
- No snapshot entry from before E1c moves.
- No new input.
- Timing stays within +5% per path.
- The behaviour is the same in the standard projection, historical and Monte Carlo runs, and the cliff plan's phases. It
  stays one year loop with a mode switch, never a fork.

## 4. Facts (primary sources, retrieved 2026-10-23)

- **Rev. Proc. 2014-41** (IRB 2014-33, `https://www.irs.gov/pub/irs-irbs/irb14-33.pdf`, pages 364-367):
  - **Section 3:** using the revenue procedure's calculations is optional. A taxpayer may use "any method, provided that
    the amounts claimed satisfy the requirements of applicable tax law".
  - **Section 5.01 (iterative):** steps 1-6, repeated until the deduction and the credit both change by less than $1. When
    they never do, the taxpayer "should not use the iterative calculation method". The text then sends the taxpayer to the
    alternative calculation "in section 5.03". That is a typo for 5.02, since 5.03 holds the limits.
  - **Section 5.02 (alternative):**
    - Step 1: the deduction at the full specified premiums, after the 5.03 limit.
    - Step 2: the initial credit at step 1's household income.
    - Step 3: the deduction equal to the premiums less the step-2 credit, after the 5.03 limit.
    - Step 4: the final credit at the household income that the step-3 deduction gives.
    - The return claims step 3's deduction and step 4's credit.
  - **Section 5.03:** the deduction may not exceed the lesser of:
    - (A) the earned income from the business (the engine's cap, `sePlanNetA/B`);
    - (B) the specified premiums not paid through advance credit payments, plus the limitation on additional tax under
      Treas. Reg. 1.36B-4T(a)(3)(iii).
  - **Section 2.03 (Treas. Reg. 1.162(l)-1T(a)(1)):** the deduction is at most the lesser of (1) the specified premiums less
    the premium tax credit, and (2) the specified premiums not paid through advance payments, plus the additional tax
    imposed under 36B(f)(2)(A) after the limitation of 36B(f)(2)(B).
  - **Example 2** shows the two methods giving different legal answers for the same facts: 5.02 gives a deduction of
    $6,322 and a credit of $6,770; 5.01 gives $7,151 and $6,849.
- **No repayment cap from 2026 (IRC 36B(f)(2)):** Pub. L. 119-21 section 71305 struck the limitation on increase, 36B(f)(2)(B),
  for taxable years beginning after December 31, 2025. What remains is now plain 36B(f)(2), without the "(A)" that the
  regulation cites (26 USC 36B amendment notes, Cornell LII, retrieved 2026-10-23). Excess advance credit is now repaid in
  full as additional tax. Consequences:
  - Bound (2) above becomes (premiums - advance payments) + (advance payments - final credit) = premiums - final credit,
    the same as bound (1).
  - The legal bound is therefore simply **deduction <= premium less the final credit at the return's MAGI**, whatever was
    paid in advance.
  - The engine does not model advance payments separately. This fact means it does not need to: during the year the
    household pays a premium after an estimated credit, and the return settles both the credit (Form 8962) and the tax.
  - The engine's earlier tax years (before 2026) are not modeled with a repayment cap either (unchanged).
- **Reconciliation keeps the coverage the year had** (Treas. Reg. 1.36B-2, Cornell LII, retrieved 2026-10-23):
  - **(b)(6), household income below 100% of the poverty line:** the taxpayer is still an applicable taxpayer, so still
    gets the credit, when all of these hold:
    - they enrolled through an Exchange;
    - the Exchange estimated, at enrollment, household income of at least 100% (and at most 400%);
    - advance credit was paid for one or more months;
    - they would be an applicable taxpayer at an income in 100-400%.
  - **(c)(2)(v), Medicaid:** an individual whom the Exchange assessed at enrollment as not eligible for Medicaid is
    treated as not eligible for the period of that coverage.
  - So a return whose MAGI falls below the 100% floor or the Medicaid line, after a year that paid a credited marketplace
    premium, still gets a credit at that MAGI. It is not charged the full premium, and it is not priced at Medicaid's $0.
  - The engine's in-year price, `acaNetCost` (`src/us/core/healthcare/aca.js`), applies the floor and the Medicaid line
    to the MAGI estimate. That is right for the year's own pricing (an enrollment decision), but not for the return
    (section 6.2).
- **The forced pass's own true-up** (7O follow-up F5; the Medicaid and 100%-of-FPL step-downs) predates E1c and is not
  changed (decision 2).

## 5. Decisions (owner, 2026-10-23)

1. **The settlement's cash goes to the next year** (option A of the plan's three), as a real return and Form 8962 do:
   - The settled year keeps its draws, its paid premium and its paid tax.
   - The difference between what it paid and what its return says becomes a fixed amount in the next year's cash flow: an
     inflow for a refund, an outflow for a balance due.
   - The last year's settlement goes to the run's estate.
   - The year is not re-run, so the circularity cannot reopen.
   - Rejected: B (same-year cash, where a balance due could take cash below zero after the draws, and the engine has no
     rule for that) and C (an extra same-year draw, which moves the MAGI again).
2. **162(l) only.** The settlement covers every kept-phase year that has a 162(l) deduction allowed and does not end
   converged. In the code that is every year whose kept phase holds a deduction, forced afterwards or not (section 6.1). The forced pass's same-year premium refund stays as it is. Folding
   it into the settlement would move pre-E1c snapshot entries.
3. **What the settled return feeds:**
   - **The recorded MAGI is the settled one:** `realizedMagi`, so the row's `magiProxy`, `irmaaMagiHistory` and, in
     two-return years, `magiHistoryA/B`, `irmaaMagiHistoryA/B` and the row's `magiA/B`. This is the return's MAGI, the one
     SSA reads for IRMAA two years on.
   - **Next year's seed** (`prevSeHealthA/B`) is the settled deduction.
   - **The guardrail and `firstWithdrawal` records:** the settled year keeps what it recorded, because the draws it paid do
     not change. The next year leaves the settlement out of its recorded need, because that cash belongs to last year's
     return, not this year's spending.
4. **The cliff plan judges a held phase on its settled return** (owner, after the second review). Each held phase
   settles at its end: the natural phase and each trial. The plan's tests read the settled figures:
   - `met` (the stay-under or fill against the line);
   - `ok`;
   - `cliffCost` (the return's premium plus the IRMAA at the settled MAGI);
   - the score (the settlement counts as money owed to the household);
   - the row's `cliffChoice` label and `planMissed`.

   So a stay-under that the return breaks is a missed plan, not a hidden one.

## 6. Design

### 6.1 Which years settle

A phase settles at its end when its final pass holds a deduction (`seHeld`), whether or not the phase then ended in the
forced pass. A year without phases has one phase. In a phased year (decision 4) the natural phase and each trial settle at
their own end, and the year's settlement is its kept phase's.

This is the owner's "every held or forced year with a deduction allowed", stated exactly:

- An unconverged, unheld pass with a deduction allowed always reaches the switch before the forced pass. The switch, at
  `if (unconverged && !forcedPass && !replaying && !seHeld && (profile.seAllowA || profile.seAllowB))`, comes before
  `if (unconverged && !forcedPass && !replaying && usesMagiEstimate)`.
- The switch holds unless the step-1 deduction is 0.
- So a year with a deduction allowed that ends forced or unresolved without a hold has a step-1 deduction of 0. Its
  deduction is 0 at any income, and there is nothing to settle.
- Settling such a year anyway would only add a last-bit carry, from the tax being summed in a different order.

The builder confirms this reading in the code and pins it with a test: a forced, unheld year with a deduction allowed has
`seHealthA/B` 0.

**Where it runs:** after `realizedMagi` is computed and before the phase-end block (`if (phased && !replaying)`). Every
phase decision then reads the settled figures (section 6.7).

**Replays:** a replay (the apply fallback, the choose winner's replay) repeats a phase's final pass exactly, so its
settlement is the same doubles as the one in the phase's record. The builder either recomputes it or restores it from the
record.

**What is kept:** only the kept phase's settlement reaches the next year (`seCarry`), the seed, the recorded MAGI and the
row. A trial's settlement exists only in its record.

A converged, unheld year never settles. Its rows, its records and the next year's inputs are unchanged, so the year is
byte-identical. A household with no deduction allowed never reaches the test beyond one boolean read (the E1c `seLive`
speed rule).

**My call:** a held year settles whatever the size of the difference, with no $1 threshold. The result is exact, and
these years change anyway.

### 6.2 The return's price (reconciliation)

Every price the settlement takes (the search's probes, the bound check and the settled premium) is the **return's
price**, not the in-year price. The coverage is the one the kept phase's final pass paid for, per person on the
individual market:

- **Medicaid** (the pass priced the person at or under the state's Medicaid line, with `medicaidWhenEligible` on and the
  work requirement met, so $0): stays $0 at any settled MAGI. Medicaid is not re-assessed on annual income.
- **Marketplace with an advance credit** (the pass priced the person in the credit band: above the Medicaid line, at or
  above 100%, under 400% unless `acaEnhanced`): the credit at the settled MAGI. The Medicaid line never applies
  ((c)(2)(v)). Below 100% the credit is still allowed ((b)(6)), using the lowest band's applicable percentage as
  `acaExpectedPct` gives it. Above 400% (without `acaEnhanced`) there is none, and the excess is repaid in full.
- **Marketplace without an advance credit** (the pass priced the full premium: under the 100% floor, under the Medicaid
  line with the box off or the work requirement failed, or over 400%): `acaNetCost` at the settled MAGI, except that the
  Medicaid line's $0 never applies. A return at 100-400% claims the credit it did not get in advance; a return still
  under the floor gets none.

Medicare, IRMAA and long-term care are priced as `healthcareCost` prices them, at the settled MAGI where they read this
year's MAGI (the IRMAA appeal).

In a year where the paid MAGI and the settled MAGI sit on the same side of every line, the return's price equals
`acaNetCost`. The difference is only across the floor and the Medicaid line.

**Plumbing (the builder's call, within these rules):**
- One shape: for example a fixed field on `hcArgs` that is always present and `0` (in-year) except in the settlement's
  calls, read by `healthcareCost` and passed to a reconciliation branch of `acaNetCost`. It must not add work, or change a
  double, in the in-year path.
- The paid coverage per person is derived from the kept pass's priced MAGI (each return's own MAGI in two-return years).
  It is captured once, before the settlement's first `costAt`.

### 6.3 The settled deduction

The year's final draws are fixed: `traditionalGross`, `taxableGainGross` and, with an inherited ledger, `inhRealA/B`. At
those draws the engine runs the existing search (`seSearch`, decision 10, else 9) at the return's price: the consistent
deduction by bisection, else section 5.02's. Two-return years search per return, as today.

- `seSearch` must be built for this call if the kept phase never built it. It is built on first use and allocates nothing
  in a year that does not settle.
- A $0 step-1 deduction settles to 0 (it cannot occur in a held year, section 6.1).

**Legal-bound check (my call).** The result must satisfy D <= the deduction the premium at D's own MAGI allows, plus $1,
per return. That is the 1.162(l)-1T bound with the 5.03 cap.

- The consistent deduction satisfies it by construction: the bisection keeps the left end, where `allowed(lo) >= lo`.
- 5.02's satisfies it wherever the net premium rises with MAGI: step 3's MAGI is at or above step 1's, so the final credit
  is at or below the step-2 credit.
- At the return's price, a year that paid a credited marketplace premium has no floor and no Medicaid jump, so the price
  rises with MAGI. Only a year that paid with no advance credit under the 100% floor still has a step down: its return
  gains a credit as the MAGI crosses 100%. Near that step 5.02 can break the bound, and there the part takes the
  bisection's left end `lo` instead. It satisfies the bound
  and is the largest legal deduction the search saw.
- Today `rootOf` returns -1 on a miss. The settlement call also needs the left end, for example kept in a pass-local beside
  `seFixA/B`.
- **My call:** the hold path does not change. A hold is now only the year's working estimate, and the settlement corrects
  it.
- The check costs one `costAt` per return, only in a settling year.

### 6.4 The settled return and the settlement amount

At the final draws and the settled pair `(sdA, sdB)`:

- **Settled premium:** `healthcareSettled = costAt(traditionalGross, taxableGainGross, sdA, sdB, inhRealA, inhRealB)` at the
  return's price (section 6.2). This is the whole healthcare figure, so the in-year IRMAA appeal, which reads this year's
  MAGI, is re-priced with it.
  - **Year 0 or 1 without entered prior MAGIs:** IRMAA's stand-in is `irmaaMagiHistory[0]` (`irmaaLookbackMagi`).
  - **Write the histories first:** write `irmaaMagiHistory[year]` (and in two-return years `magiHistoryA/B` and
    `irmaaMagiHistoryA/B`) from the settled MAGI **before** this call, so year 0's own stand-in is the return's MAGI.
  - **Known, accepted:** the search's probes in that year still read the paid stand-in. This is the same approximation the
    in-year iteration makes, and it only arises in year 0 at Medicare age with no prior MAGIs entered. Read
  `lastCost.appealA/B` right after this call if the row's appeal fields should follow the return. **My call:** they do.
- **Settled tax:** set `profile.seHealthA/B = sdA/sdB` and `profile.medicalExpense = healthcareSettled + ltc - (sdA + sdB)`.
  Then recompute the tax with the exact expression that produced `totalTax` in the year's branch: the same arguments, in
  the same order, summed in the same order. An unmoved deduction then gives the same double.
  - A draw year: `ficaTax + taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty`. This is
    also the forced pass's `taxAfter`.
  - A surplus year with a ladder gain: `ficaTax + taxFor(ctx, profile, ladderGain, conversionAmount)`.
  - A surplus year without one: `taxFor(ctx, profile, 0, conversionAmount) + ficaTax`, the order of `tax`.

  162(l) changes neither the SE tax nor FICA.
- **Settled MAGI:** `realizedMagi` is recomputed with `sdA + sdB` in place of `seRealA + seRealB`.
- **Settlement:** `seSettle = (healthcare - healthcareSettled) + (totalTax - taxSettled)`.
  - `healthcare` and `totalTax` are what the year charged, after the forced pass's refund where there was one.
  - Positive is a refund, negative a balance due.
  - It is in the year's nominal dollars and gets no growth (the return is filed in the spring).

The profile keeps the settled values after the year, so the trace and `endTax` read the return.

The rows keep `healthcare` and `tax` as paid. In a settled year the row gains flat numeric fields: `seDeductionA`,
`seDeductionB` (the settled pair), `healthcareSettled`, `taxSettled` and `seSettlement` (the amount). They appear only in
those rows, so no other row changes shape. Field names are the builder's call.

### 6.5 The next year

A new loop-level `let seCarry = 0`:

- written once, after the kept phase of a settling year (`seCarry = seSettle`);
- read and cleared at the start of the next year.

It is not mutated inside a year body, so it needs no `scalarSnapshot` entry, like `prevSeHealthA/B`. Register it in
`tests/engine-purity.json` only if the purity scan sees it as module state; it is a local of `runProjection`, so it should
not.

In the next year:

- **The cash flow:** `if (seCarry !== 0) flow += seCarry`. This is appended after both strategies' sums, like `inhDraw`, so
  a year without a carry is the same double.
  - A refund lowers the need.
  - A balance due raises it, and the draws fund it through the normal waterfall (no negative-cash case).
  - The amount is fixed for the whole year: every pass of the MAGI iteration and every cliff-plan phase sees the same
    term, so it adds no circularity.
  - It is not income: a federal refund is not taxable, and excess credit repaid is tax. It never enters the MAGI.
- **The cash mechanics read the flow with the carry.** They are about the draws, and the draws are what the cash
  requires:
  - the branch (`flow >= 0`, or a draw);
  - `wd.need`;
  - the forced pass's gate (`forcedPass && flow < 0`);
  - the cliff plan's natural-phase gate (`if (flow < 0)`) and its reach (`REACH_GROSS_UP * -flow`);
  - the forced-pass statistic.
- **The records read the flow without it**, `flowOwn = flow - seCarry`. Keep it as its own double, the flow before the carry
  was added, never derived by subtracting.
  - Adding the carry back inside today's branches is not enough, because a carry can tip a year across zero.
  - A plain surplus year records nothing, and `guardrails.js` then keeps last year's `prevNeed` / `prevPortfolio`. So a
    refund that turns a draw year into a surplus would drop that year's record.
  - So the record step decides and sizes from `flowOwn` exactly as it does from `flow` today, whichever cash branch runs:
    - `flowOwn < 0`: record `max(0, -flowOwn - lumpExpense)` (plus `inhNeedAdj` as today), and `firstWithdrawal` in the
      retirement year;
    - `flowOwn >= 0`: record only on the inherited path, as today;
    - the forced pass's re-record runs only when `flowOwn < 0` and uses `-flowOwn - refund`. The forced pass itself is
      gated on the cash flow (`flow < 0`). A balance-due carry can make `flowOwn >= 0 > flow`, and then the forced pass
      records nothing, as a surplus year does.
  - In a year with no carry, `flowOwn` is `flow`, so the records are the same doubles.
- **My call:** `lambdaOf`'s `lambdaNeed` uses `flowOwn` too, since the carry is not a yearly draw.
- **The row** of the next year carries the received amount (`seSettlementIn`, only when non-zero).

**The last year:** the last row the run produces has no next year. Its `seSettle` is added to the estate's `cash`, the
non-enumerable `estate` record that `afterTaxEndValueUS` reads. The result's rows, and so the visible final balance, do not
include it. **My call** (the owner agreed "the estate").

**A death:** the carry passes to the survivor's year like any cash.

### 6.6 The seed and the recorded MAGI

- `prevSeHealthA/B`:
  - in a year without phases, the settled pair;
  - in a phased year, `naturalRec.seA/B` as today. When the natural phase was held, those are now its settled pair (the
    natural record stores the settled pair, decision 4).
- `realizedMagi` (settled) feeds:
  - `row.magiProxy` and `irmaaMagiHistory[year]`;
  - in two-return years, `returnMagis` with the profile's settled `seHealthA/B`, which gives `magiHistoryA/B`,
    `irmaaMagiHistoryA/B` and `row.magiA/B`.
- The cliff-plan label test (`realizedMagi <= yearPlan.magi + 1`, row `cliffChoice`, `planMissed`) reads the settled MAGI
  (decision 4). It is the same MAGI the phase's `met` was judged on, so a kept trial's label matches its `met`.

### 6.7 The cliff plan

Decision 4: a held phase is judged on its settled return. At the end of a held phase, `realizedMagi` is already the
settled MAGI (section 6.1), and `healthcareSettled` and `seSettle` are known. In a phase that is not held, these are the
paid figures (`healthcareSettled = healthcare`, `seSettle = 0`), so an unheld phase is judged exactly as today.

- **The natural record** (`naturalRec`, both the apply and the choose literal):
  - `realized`: the settled MAGI;
  - `seA/B`: the settled pair;
  - `cliffCost`: `healthcareSettled + irmaaAt(...)` at the settled MAGI;
  - `score`: `afterTaxValue(bal, ...) + seSettle - irmaaAt(...)`;
  - the settlement itself, so a replay or the kept phase can restore it.

  `natOf`'s `natMagi` is the settled MAGI, and so are the `lo` / `hi` reach tests and `skippedSide`, which read
  `realizedMagi`.
- **A trial record:** the same fields; `met` reads the settled MAGI, and `ok`'s `naturalRec.cliffCost - cliffCost > 1`
  compares settled with settled.
- **apply:** `met` reads the settled MAGI.
- **IRMAA at the settled MAGI.** `irmaaAt(trad, gain, ia, ib)` prices the MAGI from `magiBase` (the pass's 162(l) estimate,
  which in a held phase is the hold). At the settled return it must be priced from the settled pair:
  - in one-return years, a MAGI of `settled MAGI` (the hold replaced by `sdA + sdB`);
  - in two-return years, `returnMagis` with the settled pair on the profile.

  The builder adds an argument for the deduction pair, as `costAt` has, so the in-year calls are unchanged. The
  `irmaaChecks` entry (`nat`, `trial`) reads the settled MAGIs.
- **The score counts `seSettle`.** A refund is owed to the household at the end of the year, and a balance due is owed by
  it. The settlement is cash at face value (it arrives within months), not scaled by lambda.
- **Trial start:** a trial is seeded from `naturalRec.realizedTrad`, `gain`, `seA/B` and `inhA/B`. `seA/B` is now the
  natural phase's settled pair (a better starting estimate). `seHeld` and `seKind` are reset as today.
- **The carries:** the per-phase settlement fields join `naturalRec` and the trial records. The loop-level state
  (`seCarry`, written after the kept phase) stays outside the phases.
- `computeCliffPlan`'s candidate runs are ordinary runs, so they settle too.

**`computeCliffPlan`'s `measure` (my call):**

- Its `cost` sums each row's `tax + healthcare`.
- A settled row adds its `taxSettled + healthcareSettled` instead, the return's figures.
- The carry is only timing, so it is not added again.
- `tests/solver_scan.js` takes the same sum and follows.

### 6.8 Modes

- Historical and Monte Carlo runs use the same loop and the same code: no mode test.
- `BUCKET_MODE` sums `flow` in its own order, and the carry is appended after both sums.
- Single-person mode, two-return years and the survivor remap read the profile's post-remap slots, as `seSearch` does
  today.

## 7. Speed

- In a phase that does not settle: one boolean test at the phase's end.
- In a held phase: one `seSearch` (a step-1 `costAt`, at most about 60 bisection probes per search, one per return), the
  legal-bound check, one `costAt` and one `taxFor`.
- In a phased year, each held phase settles once: the natural phase and up to the candidate trials. A replay restores the
  settlement or recomputes it.
- In the next year: one non-zero test on `seCarry` in the flow and the records.

Settling years are rare (held years). Gates: `tests/bench_runs_interleaved.js`
(including `--warm-analysis`) and the per-path timing within +5%. Hold the hot-path rules: no allocation in a year that
does not settle.

## 8. Tests

- **`tests/se_health.js`, invariant grid**, restated for the settlement:
  - (a) the settled deduction never exceeds the settled premium (+$1) or the plan net;
  - (b) `healthcareSettled` is the return's price at the recorded MAGI (section 6.2; `acaNetCost(row.magiProxy, ...)`
    except across the floor and the Medicaid line, within the existing $2);
  - (c) the understated count against the search at the final draws (`searchAt`, with `base = magiProxy + seDeductionA +
    seDeductionB`, at the return's price of section 6.2)
    is asserted **0**, no longer counted. The grid is Texas, a non-expansion state. So `searchAt` must take the same
    legal-bound fallback as section 6.3 (the bisection's left end where 5.02 breaks the bound), or the low-income years
    count as understated when they are not;
  - (d) in each settled year, `seSettlement` equals `(healthcare - healthcareSettled) + (tax - taxSettled)` exactly (the
    same doubles);
  - (e) the next row's `seSettlementIn` equals it.

  Converged rows keep the old assertions on `healthcare`.
- **The spec owner's wider grid** (plan block): single, 60, retiring at 60, main income 0, stream 20,000-60,000 by 1,000,
  spending 20,000-40,000 by 1,000, basis 30 and 60, `tx`, premium 18,000, no inflation, rent 0, years 0-4 (8,610 years).
  Run it as a probe (not in CI) with the same five checks, and record the counts in the Batch notes.
- **The tipped year:** a carry changes the draws, and with them the MAGI and the premium, so "the same records as
  without a carry" cannot be compared directly. The test asserts the rule instead: the records equal what today's rule
  gives on `flowOwn`.
  - It needs a year where a carry turns a draw year into a surplus, and one where a carry turns a surplus into a draw
    year, both with and without the forced pass.
  - **My call:** reach them with a test-only switch on `ctx.test` that injects a carry into a chosen year (for example
    `ctx.test.seCarryAt = { year, amount }`). It is read only by the uncached functions (`simulateFresh`, the Vitest `*Raw`
    helpers). It needs no cache-key change, since the cached wrappers never see it.
- **The E1c cases** (Task 9a, 10a, 11; two returns 70,000-74,000; the Medicaid line) still pass. Values that move are held
  years and the years after them; each move is explained in the commit.
- **The independent reviewer's eleven probe households** (E1c review part 4; two returns with children, both
  self-employed with `capA` binding, near 100% of the poverty line, the Medicaid box on and off, historical and seeded
  paths, survivors), each run against the five checks. Re-run its mutation list against the new code.
- **Byte-identity:** every converged year and every household without a 162(l) deduction is unchanged.
  - `tests/golden.js` and the snapshot baselines: a pre-E1c entry must not move.
  - An E1c entry with a held year (or a year after one) may move. Update it with `npm run snapshot:update` and say so in the
    commit.
  - `tests/historical_parity`, `tests/survivor_symmetry.js` (identical self-employed partners: A dies equals B dies,
    settlement included), `tests/engine_purity.js`, `tests/two_return_magi.js`.
- **Reconciliation price:** a held year whose settled MAGI falls under 100% (Texas) and under the Medicaid line
  (an expansion state, box on), after paying a credited premium, gets the credit at the lowest band. A Medicaid year
  stays $0 when its settled MAGI rises. An uncredited year whose return reaches 100-400% gets the credit.
- **IRMAA after a settled year:** a household at Medicare age with 162(l). The IRMAA charged two years after a settled
  year reads the settled MAGI. Year 0 with no prior MAGIs entered uses the settled stand-in.
- **The appeal fields** of a settled row follow the return's MAGI (section 6.4).
- **`measure`:** a cliff-plan run with a settled year sums `taxSettled + healthcareSettled` for that row.
- **Decision 4:** a held natural phase whose trial's settled MAGI crosses the line it planned to stay under. The trial is
  not `met`, it does not win, and no row labels it. A held phase whose settlement is a refund scores higher by exactly
  `seSettle`. An unheld phased year is unchanged (byte-identical records and choice).
- **A Monte Carlo path and a historical path** through a settled year: exact and deterministic. The same seed gives the
  same doubles twice in one process.
- **Vitest** (`tests/unit/us/`), a new suite for the pure parts:
  - the legal-bound fallback;
  - the carry in the next year's flow and its absence from the recorded need (guardrail, `firstWithdrawal`, lambda);
  - the last-year estate;
  - a two-return year settled per return.

  Exact comparisons only. Expected values are hand-computed or two runs compared in one process (CLAUDE.md rules 1-7).
- **A UI check is not needed** (no UI change). `npm run test:ui` still runs in CI.

## 9. Docs

- `docs/architecture/magi-iteration.md` ("Third estimate"): replace the decision-12 limitation with the settlement.
- `docs/architecture/self-employment.md`: one line.
- `docs/architecture/engine.md`: the carry in the flow and the records.
- `README.md` feature list: a line if the 162(l) text there names the limitation.
- The Batch 5 notes in `docs/next-batches-plan.md`: the decisions, the grid counts before and after, and the 2026 repayment
  cap fact.
- The US version badge is bumped (V134 -> V135 or the next free number), because held years' numbers change.

## 10. Not modeled

- Advance credit payments as a separate figure. They are not needed under the 2026 law (section 4).
- A state income tax refund received next year, which is taxable federally for an itemizer.
- Interest or penalties on a balance due.
- The quarter the refund arrives in: it is a whole-year cash term.
- An Exchange's mid-year redetermination. The coverage kind is the year's as paid (section 6.2).
