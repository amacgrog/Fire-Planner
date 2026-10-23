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
- **A forced year with a deduction allowed but not held** (`forcedPass`, no `seHeld`) recomputes the deduction once from
  the premium the forced pass charges (`if (!seHeld && (profile.seAllowA || profile.seAllowB))` in the forced-pass block).
  That premium was priced at the previous deduction's MAGI, so this deduction is not consistent with it either.
- **An unresolved year** (unconverged, no forced pick) keeps its last pass's deduction, which is also not consistent.

## 3. Goal

Every self-employed year ends exactly legal at its own final income. The return's deduction is the consistent one at the
year's final draws, else section 5.02's at those draws. The return's premium is the cost at the resulting MAGI. The
deduction never exceeds that premium (Treas. Reg. 1.162(l)-1T(a)(1), below). Anything the year paid that differs from
the return is settled the way a real return settles it: in the next year's cash.

Constraints, all from the Batch 5 goal:

- Converged years stay byte-identical.
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
  for taxable years beginning after December 31, 2025 (26 USC 36B amendment notes, Cornell LII, retrieved 2026-10-23).
  Excess advance credit is now repaid in full as additional tax. Consequences:
  - Bound (2) above becomes (premiums - advance payments) + (advance payments - final credit) = premiums - final credit,
    the same as bound (1).
  - The legal bound is therefore simply **deduction <= premium less the final credit at the return's MAGI**, whatever was
    paid in advance.
  - The engine does not model advance payments separately. This fact means it does not need to: during the year the
    household pays a premium after an estimated credit, and the return settles both the credit (Form 8962) and the tax.
  - The engine's earlier tax years (before 2026) are not modeled with a repayment cap either (unchanged).
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
   converged: held, forced or unresolved (section 6.1). The forced pass's same-year premium refund stays as it is. Folding
   it into the settlement would move pre-E1c snapshot entries.
3. **What the settled return feeds:**
   - **The recorded MAGI is the settled one:** `realizedMagi`, so the row's `magiProxy`, `irmaaMagiHistory` and, in
     two-return years, `magiHistoryA/B`, `irmaaMagiHistoryA/B` and the row's `magiA/B`. This is the return's MAGI, the one
     SSA reads for IRMAA two years on.
   - **Next year's seed** (`prevSeHealthA/B`) is the settled deduction.
   - **The guardrail and `firstWithdrawal` records:** the settled year keeps what it recorded, because the draws it paid do
     not change. The next year leaves the settlement out of its recorded need, because that cash belongs to last year's
     return, not this year's spending.

## 6. Design

### 6.1 Which years settle

After the kept phase is known, a year settles when `profile.seAllowA || profile.seAllowB` and its kept phase did not end
converged:

- `seHeld`, or
- `forcedPass`, or
- the kept phase's final pass is `unconverged`.

That is the point where the kept phase's statistics are counted today (`if (forcedPass && flow < 0) magiStats.forced++`
and the lines after it), after every phase replay.

A converged, unheld year never settles. Its rows, its records and the next year's inputs are unchanged, so the year is
byte-identical. A household with no deduction allowed never reaches the test beyond one boolean read (the E1c `seLive`
speed rule).

**My call:** a qualifying year settles whatever the size of the difference, with no $1 threshold. The result is exact, and
these years change anyway.

### 6.2 The settled deduction

The year's final draws are fixed: `traditionalGross`, `taxableGainGross` and, with an inherited ledger, `inhRealA/B`. At
those draws the engine runs the existing search (`seSearch`, decision 10, else 9): the consistent deduction by bisection,
else section 5.02's. Two-return years search per return, as today.

- `seSearch` must be built for this call if the kept phase never built it. It is built on first use and allocates nothing
  in a year that does not settle.
- A $0 step-1 deduction settles to 0.

**Legal-bound check (my call).** The result must satisfy D <= the deduction the premium at D's own MAGI allows, plus $1,
per return. That is the 1.162(l)-1T bound with the 5.03 cap.

- The consistent deduction satisfies it by construction: the bisection keeps the left end, where `allowed(lo) >= lo`.
- 5.02's satisfies it wherever the net premium rises with MAGI: step 3's MAGI is at or above step 1's, so the final credit
  is at or below the step-2 credit.
- Below 100% of the poverty line in a non-expansion state, or with `medicaidWhenEligible` off, the premium can fall as MAGI
  rises, and 5.02 can break the bound. There the part takes the bisection's left end `lo` instead. It satisfies the bound
  and is the largest legal deduction the search saw.
- The check costs one `costAt` per return, only in a settling year.

### 6.3 The settled return and the settlement amount

At the final draws and the settled pair `(sdA, sdB)`:

- **Settled premium:** `healthcareSettled = costAt(traditionalGross, taxableGainGross, sdA, sdB, inhRealA, inhRealB)`. This is
  the whole healthcare figure, so the in-year IRMAA appeal, which reads this year's MAGI, is re-priced with it. Read
  `lastCost.appealA/B` right after this call if the row's appeal fields should follow the return. **My call:** they do.
- **Settled tax:** set `profile.seHealthA/B = sdA/sdB` and `profile.medicalExpense = healthcareSettled + ltc - (sdA + sdB)`,
  then `taxSettled = ficaTax + taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross) + wd.earlyPenalty`. 162(l)
  changes neither the SE tax nor FICA. In a flow >= 0 year the paid tax is computed with `ladderGain` (or `tax` when there
  is none), and the settled tax uses the same arguments.
- **Settled MAGI:** `realizedMagi` is recomputed with `sdA + sdB` in place of `seRealA + seRealB`.
- **Settlement:** `seSettle = (healthcare - healthcareSettled) + (totalTax - taxSettled)`.
  - `healthcare` and `totalTax` are what the year charged, after the forced pass's refund where there was one.
  - Positive is a refund, negative a balance due.
  - It is in the year's nominal dollars and gets no growth (the return is filed in the spring).

The profile keeps the settled values after the year, so the trace and `endTax` read the return.

The rows keep `healthcare` and `tax` as paid. In a settled year the row gains flat numeric fields: `seDeductionA`,
`seDeductionB` (the settled pair), `healthcareSettled`, `taxSettled` and `seSettlement` (the amount). They appear only in
those rows, so no other row changes shape. Field names are the builder's call.

### 6.4 The next year

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
- **The recorded need leaves it out:**
  - the guardrail and `firstWithdrawal` records in both branches (`flow >= 0` with the inherited adjustment, and
    `flow < 0`);
  - the forced pass's net need.

  Concretely, each `recorded` figure adds back `seCarry`. **My call:** `lambdaOf`'s `lambdaNeed` leaves it out too, since it
  is not a yearly draw.
- **The row** of the next year carries the received amount (`seSettlementIn`, only when non-zero).

**The last year:** the last row the run produces has no next year. Its `seSettle` is added to the estate's `cash`, the
non-enumerable `estate` record that `afterTaxEndValueUS` reads. The result's rows, and so the visible final balance, do not
include it. **My call** (the owner agreed "the estate").

**A death:** the carry passes to the survivor's year like any cash.

### 6.5 The seed and the recorded MAGI

- `prevSeHealthA/B`:
  - the settled pair when the kept phase is the natural phase (`naturalRec` null, or `yearPlan === NO_PLAN` at the end);
  - otherwise `naturalRec.seA/B` as today.

  The seed is only a starting estimate. The natural phase is not separately settled when a trial wins. **My call.**
- `realizedMagi` (settled) feeds:
  - `row.magiProxy` and `irmaaMagiHistory[year]`;
  - in two-return years, `returnMagis` with the profile's settled `seHealthA/B`, which gives `magiHistoryA/B`,
    `irmaaMagiHistoryA/B` and `row.magiA/B`.
- The cliff-plan label test (`realizedMagi <= yearPlan.magi + 1`, row `cliffChoice`) stays on the kept phase's paid MAGI.
  The plan's decision was made on it, and moving the label would count spurious `planMissed`. **My call:** compute the label
  before the settlement replaces `realizedMagi`.

### 6.6 The cliff plan

- Phases are chosen on the paid numbers as today: natural, trials, the fallback and winner replays, `naturalRec` /
  `trialRecs`, scores and `cliffCost`. The settlement runs once, for the kept phase only, after the choice.
- No new per-phase variable joins the carries. The settlement's state (`seCarry`, the settled pair) lives outside the
  phases.
- `computeCliffPlan`'s candidate runs are ordinary runs, so they settle too.

**Known, accepted (my call):** a trial's score ignores the next year's settlement. The plan compares the year's end
balances, and the settlement is next year's cash.

### 6.7 Modes

- Historical and Monte Carlo runs use the same loop and the same code: no mode test.
- `BUCKET_MODE` sums `flow` in its own order, and the carry is appended after both sums.
- Single-person mode, two-return years and the survivor remap read the profile's post-remap slots, as `seSearch` does
  today.

## 7. Speed

- In a non-settling year: one boolean test per year, after the kept phase.
- In a settling year: one `seSearch` (a step-1 `costAt`, at most about 60 bisection probes per search, one per return), the
  legal-bound check, one `costAt` and one `taxFor`.
- In the next year: one non-zero test on `seCarry` in the flow and the records.

Settling years are rare (held, forced or unresolved years with a deduction allowed). Gates: `tests/bench_runs_interleaved.js`
(including `--warm-analysis`) and the per-path timing within +5%. Hold the hot-path rules: no allocation in a year that
does not settle.

## 8. Tests

- **`tests/se_health.js`, invariant grid**, restated for the settlement:
  - (a) the settled deduction never exceeds the settled premium (+$1) or the plan net;
  - (b) `healthcareSettled` is the cost at the recorded MAGI (`acaNetCost(row.magiProxy, ...)` within the existing $2);
  - (c) the understated count against the search at the final draws (`searchAt`, with `base = magiProxy + seDeductionA`)
    is asserted **0**, no longer counted;
  - (d) in each settled year, `seSettlement` equals `(healthcare - healthcareSettled) + (tax - taxSettled)` exactly (the
    same doubles);
  - (e) the next row's `seSettlementIn` equals it.

  Converged rows keep the old assertions on `healthcare`.
- **The spec owner's wider grid** (plan block): single, 60, retiring at 60, main income 0, stream 20,000-60,000 by 1,000,
  spending 20,000-40,000 by 1,000, basis 30 and 60, `tx`, premium 18,000, no inflation, rent 0, years 0-4 (8,610 years).
  Run it as a probe (not in CI) with the same five checks, and record the counts in the Batch notes.
- **The E1c cases** (Task 9a, 10a, 11; two returns 70,000-74,000; the Medicaid line) still pass. Values that move are held
  years and the years after them; each move is explained in the commit.
- **The independent reviewer's eleven probe households** (E1c review part 4; two returns with children, both
  self-employed with `capA` binding, near 100% of the poverty line, the Medicaid box on and off, historical and seeded
  paths, survivors), each run against the five checks. Re-run its mutation list against the new code.
- **Byte-identity:** every converged year and every household without a 162(l) deduction is unchanged.
  - `tests/golden.js` and the snapshot baselines: a pre-E1c entry must not move.
  - An E1c entry with a held, forced or unresolved year may move. Update it with `npm run snapshot:update` and say so in the
    commit.
  - `tests/historical_parity`, `tests/survivor_symmetry.js` (identical self-employed partners: A dies equals B dies,
    settlement included), `tests/engine_purity.js`, `tests/two_return_magi.js`.
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
- The natural phase's own settlement when a trial wins (section 6.5).
