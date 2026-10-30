# Batch 5 step 5: the lambda / `mult` analysis (independent, cloud session)

For the session writing step 5's spec. Measured on main 7a7df54 (PR #60 merged, US V148) with sizing on as shipped. Node 22.22.0 on a
4-core machine. The local measurement ran on Node 24, so compare figures within one machine only. A Fable subagent ran the analysis;
the cloud session reviewed it and re-ran the timing and exactness checks itself. **Nothing in the repo was changed** (no `src/` edits,
no commit, no push). The work was done in scratch copies of `src/` driven through `loadEngine()` (`tests/helpers/engine-node.mjs`,
`node --conditions=us`).

## 1. Verdict for the spec's lambda section

| Question | Answer |
|---|---|
| Change `lambdaEstimate`? | **No.** Record F as a follow-up. No point estimate helps, including the hindsight oracle (section 4). |
| Is "the keep rule filters lambda's errors" right? | **Half.** Yes for conversions-off households. **No for conversions-on**: lambda picks the sizing pass's candidate for each year (`convScore`), and moves sized plans by up to ±3.8%. |
| Is the remaining yardstick gap vocabulary? | Mostly yes (reference A against C). The part lambda controls is real but has no consistent sign. |
| Change the default `mult`? | **No.** Every default other than 1 breaks Rule A somewhere or loses endValue (section 5). |
| Keep Optimize's `mult` search? | **Yes, unsized, as shipped.** Option: shrink the grid to `[1, 1.5, 2]` (43% fewer plannings, loses 8,060 on one lifetimeCost household in 102). |
| Size Optimize's trials (`sizing: true`)? | Better on outcomes (section 7), but **fails Optimize's +40% gate** (B0.11.5): +26% to +195% on the gap households. Not recommendable at this cost; record it for the owner. |
| B0.11.4's follow-up, "sizing pass on the final winner only"? | **Would not capture the gain.** The trial that carries the gain loses while unsized, so it is never the final winner. Example: two-return @100's `[0.5,1,1]` is +26,560 sized, but unsized it loses to base. |

Suggested spec wording (for the owner to accept or not):
- Lambda: no estimator change in step 5. F is recorded as a follow-up with its measured effect (section 3). Record the levers-separated
  table (section 2).
- `mult`: default stays [1,1,1], and Optimize keeps searching it unsized. A grid shrink to `[1, 1.5, 2]` is optional. It needs
  `validMult` to keep accepting 0, or a stored-plan migration.
- Sized trials: recorded for the owner with their price (section 7). They need a cheaper form (top-k trials only, a smaller trial
  budget, or sizing only the phase a trial changes) before they can meet the +40% gate.

## 2. The baseline reproduced

Search wins, with the wins whose kept multiplier is not [1,1,1] in parentheses:

| Objective, sample | Levers on: wins (m≠1) | Levers off: wins (m≠1) |
|---|---|---|
| endValue gap / every16 / conv | 0 (0) / 13 (1) / 3 (0) | 0 / 0 / 0 |
| lifetimeCost gap / every16 / conv | 6 (2) / 37 (17) / 20 (8) | 6 (0) / 14 (5) / 14 (8) |

- Identical to the local table on both lever settings.
- The one endValue m≠1 win is every16 #6: MFJ 62, 250k+250k, taxable 300k, spending 60k, `[2,1,1]`, +10,152 (levers on only).
- The yardstick's two-return case (not in the local samples): endValue Optimize wins at @75 with `[1.5,1.5,1]`, +5,794 nominal over
  the automatic 3,916,920 (38 plannings, 2.5 s cold). At @100, base wins.
- Moved samples: 37 of 102 households have one. 34 of those deplete or draw on the house (the taxable-300k households). Only conv #0,
  #12 and #45 have moved samples without depleting, and all three draw on the house.

## 3. F: price a moved sample at its full draw

The change (solver.js, about line 463):
```diff
-        tradIncome = Math.max(rmd, Math.min(trad, draw)),
+        tradIncome = ys !== ys0 ? Math.max(rmd, draw) : Math.max(rmd, Math.min(trad, draw)),
```

Results:
- The local figures reproduce exactly.
- **Automatic plan:** endValue is unchanged in 101 of 102 households. The exception is conv #0, −1,031 nominal (its conversion moves
  from `{57:b10}` to `{58:b10}`).
- **Lifetime cost:** improves in 2 households. every16/conv #41 (HoH 58, 1500k, rule of 55) improves by 8,989 / 7,081 (its intents
  move from 62 to 64), and one other by +111.
- **Optimize:** 12 household-objectives move, net under $10k each way: every16 lifetimeCost #41 −12,158 and #29 +8,319; conv #5
  +10,020.
- **Levers-off m≠1 wins** (every16 lifetimeCost): 5 → 3.
- **Yardstick:** all 8 cases × 2 objectives give the same automatic plan and the same Optimize result, to the dollar. This was checked
  at engine level, not by re-running `tests/yardstick.mjs`'s reference searches.
- **Rule A:** no mover depletes or first draws on the house earlier.
- The single-58 trace: lambda is 0.24-0.42 with F, against 0.23-0.28 with a dip to 0.115 at 66 without it.

Verdict: harmless and more accurate in moved years (section 6), but no outcome gain worth a `src/` change.

## 4. The oracle: what a perfect per-year lambda would do

Method:
- Through a scratch seam, set each year's lambda to the hindsight value from section 6, measured under the baseline automatic plan.
- Then re-plan: automatic plan, sizing on, endValue.
- This is one iteration, not self-consistent.

| Case | Automatic value | Oracle value | Δ | Conversion map |
|---|---|---|---|---|
| TX @75 | 3,132,557 | 3,114,496 | −18,061 (−0.58%) | 9 sized years → none |
| TX @100 | 6,979,999 | 6,986,828 | +6,829 (+0.10%) | 5 → 10 irmaa1-under years |
| CA @75 / @100 | — | — | 0 / 0 | same |
| NY @75 | 3,147,870 | 3,083,472 | −64,397 (−2.05%) | intents 2→0, 5 sized years → 1 |
| NY @100 | — | — | 0 | same |
| two-return @75 | 3,916,920 | 3,921,681 | +4,761 (+0.12%) | 7 → 5 years |
| two-return @100 | 16,317,926 | 16,410,048 | +92,122 (+0.56%) | none → 6 years |
| every16 #6 (MFJ 62 fill) | 3,771,455 | 3,771,455 | 0 | same |
| conv #0 / #12 / #45 | 85,706 / 191,218 / 134,715 | 84,236 / 190,965 / 139,798 | −1.7% / −0.1% / +3.8% | changed |

All values are nominal.

- An accurate lambda moves outcomes through sizing, in both directions. When lambda rises above the user's bracket rate, the pass
  skips conversions that the shipped lambda (≈ the bracket rate) finds.
- The objective is not linear in the traditional balance (the ten-slice end tax, bracket and line kinks), so no single per-year lambda
  is "right".
- This dominates the other estimator ideas (dropping or reweighting moved samples, a bias term, other sample sets, realized future
  rates). None can do better than the hindsight value, and the hindsight value is not an improvement.

## 5. Multipliers with sizing on (not covered by the lambda table, whose trials are unsized)

Runs `computeCliffPlan(ctx, { mult })` with 8 multipliers, sizing on.

| Sample | `[0.5]^3` | `[1.5]^3` | `[2]^3` |
|---|---|---|---|
| Yardstick 8, endValue | 3 better (two-return @100 +29,643, TX @100 +6,829, two-return @75 +771) / 1 worse (TX @75 −9,243) | 0 better / 3–5 worse (TX @75 −0.58%, NY @75 −1.2% to −2.0%, NY @100 −2.3% to −2.9%, two-return @75 −0.6%) | same pattern |
| Yardstick 8, lifetimeCost | — | 4 better / 1 worse | — |
| conv 48, endValue | 2 better (+1.8%, +3.8%) / 0 worse | 6 better / 2 worse, **2 Rule A failures** | 4 / 6, **5 Rule A failures** |
| conv 48, lifetimeCost | — | 9 better / 4 worse, 2 Rule A failures | — |
| every16 48 (conversions off), endValue | 0 movers | 0 movers | 0 movers |
| every16 48, lifetimeCost | small | small, 1–3 Rule A failures for each mult ≥ 1.5 | |

The yardstick endValue row for `[1.5]^3` covers every mult ≥ 1.5. A dash means the cell was not reported.

- No default other than 1 is safe.
- lifetimeCost prefers a higher lambda and endValue a lower one. That is the objective's treatment of the end traditional balance
  (lifetimeCost does not count end tax), not estimator error.
- A per-objective default would need its own Rule A gate.

## 6. Lambda against hindsight (Q3)

Method:
- Through a seam in scratch `lamH`, add X of traditional (pre-tax, slot A) or X of Roth (as basis) at the start of year t, under the
  automatic plan run through `apply`.
- Hindsight λ = 1 − ΔV_trad / ΔV_roth, on the nominal after-tax end value.
- X = 10,000, with a 1,000 cross-check. Trace lambda is the `choose` lambda at the kept plan.

| Household | Years (moved) | Hindsight range | Mean λ / hindsight | Bias | MAE | Correlation |
|---|---|---|---|---|---|---|
| TX @75 | 20 (0) | ≈0.320 | 0.228 / 0.320 | −0.092 | 0.094 | 0.18 |
| TX @100 | 20 (0) | ≈0.247 | 0.244 / 0.247 | −0.003 | 0.028 | −0.53 |
| CA @75 | 13 (0) | ≈0.333 | 0.308 / 0.333 | −0.025 | 0.025 | 0.25 |
| CA @100 | 13 (0) | ≈0.310 | 0.324 / 0.310 | +0.014 | 0.030 | 0.76 |
| NY @75 | 17 (0) | 0.170–0.533 (0.170 at X=1k) | 0.279 / 0.317 | −0.039 | 0.128 | 0.65 |
| NY @100 | 17 (0) | ≈0.325 | 0.287 / 0.325 | −0.038 | 0.044 | −0.07 |
| two-return @75 | 15 (0) | ≈0.247 | 0.214 / 0.247 | −0.033 | 0.062 | 0.83 |
| two-return @100 | 15 (0) | ≈0.238 | 0.200 / 0.238 | −0.038 | 0.083 | 0.65 |
| every16 #6, MFJ 62 fill | 11 (0) | ≈0.093 | 0.167 / 0.093 | +0.074 | 0.074 | −0.05 |
| conv #0 (MFJ 52) | 13 (13) | 0.135–0.265 | 0.093 / 0.214 | −0.121 | 0.134 | 0.02 |
| conv #12 (two single 52) | 21 (21) | 0.000–0.582 | 0.073 / 0.200 | −0.127 | 0.221 | −0.60 |
| conv #45 (HoH 66) | 7 (7) | 0.130–0.148 | 0.209 / 0.136 | +0.073 | 0.073 | −0.80 |
| **Pooled** | 182 | | 0.217 / 0.257 | −0.040 | 0.088 | 0.31 |
| Pooled, non-moved years | 141 | | 0.250 / 0.276 | −0.026 | 0.064 | 0.46 |
| Pooled, moved years | 41 | | 0.103 / 0.194 | −0.091 | 0.168 | −0.43 |

- **Lambda runs low:** bias −0.04 pooled.
- **Errors are about 2.6× larger in moved-sample years:** MAE 0.168 against 0.064, and the correlation turns negative. Emptied-pool
  pricing gives λ of 0.00–0.06 where hindsight is 0.2–0.35. F corrects these values, but those households' outcomes don't move.
- **Hindsight is nearly constant across years within a household.** A marginal traditional dollar is mostly never drawn; it is priced
  by the ten-slice end tax. The estimator's year-to-year variation (0.12–0.46 on two-return) is mostly noise relative to the objective.
- **Hindsight depends on the bump size at kinks:** NY @75 gives 0.17 at $1k and 0.53 at $10k. An exact lambda does not exist for this
  objective.
- **Depleting households** (single 58, conv #24, every16 #27 / #30): the end value is 0, so the endValue hindsight is undefined. The cost
  view gives 0.17–1.8, which includes growth to the draw year and so is not a rate.

## 7. Where lambda matters now (Q2)

- **Only in conversions-on households, through `convScore`'s shortlist** (one candidate per year).
- Baseline `choose` traces (gap 6 + conv 48) have 644 sized years with ≥2 live candidates. Sorted by how much lambda can change before
  the winner changes:
  - **197 years (31%) are knife-edge:** the winner flips for a lambda change under 0.01 on at least one side. In 64 of them the bracket
    target wins and lambda equals the bracket's marginal rate (TX: 0.22 at the 22% bracket), so `c·λ − dTax` is flat up to the bracket
    top and any change flips the pick.
  - 321 (50%) flip within 0.05.
  - 126 (20%) are wide.
- So lambda changes sized conversions often: the oracle changed the map in 8 of 12 households, and sized trials change it in 7 conv
  households on endValue. The sign is not consistent (section 4).
- Conversions-off households: no measurable effect on the automatic plan (every16, 8 multipliers, 0 movers). In Optimize, lambda only
  tunes the order and split levers on lifetimeCost.
- A possible follow-up, not tested: break `convScore` ties at the bracket top on the whole-run measure rather than on lambda.

## 8. Optimize's `mult` search (Q4)

### Reduced grids, unsized (the shipped form), against the full grid, levers on

| Sample / objective | Search wins: full → `[1]` | Lost with `[1]`: households; total; worst | Wins: full → `[1,1.5,2]` | Lost with `[1,1.5,2]` | Plannings: full → `[1]` / `[1,1.5,2]` |
|---|---|---|---|---|---|
| gap, endValue | 0 → 0 | 0 | 0 → 0 | 0 | 84 → 12 / 48 |
| gap, lifetimeCost | 6 → 6 | 2; 23,962; 17,304 | 6 → 6 | 0 | 108 → 12 / 60 |
| every16, endValue | 13 → 13 | 1; 10,152 | 13 → 13 | 0 | 636 → 96 / 366 |
| every16, lifetimeCost | 37 → 30 | 17; 125,331; 30,236 | 37 → 37 | 1; 8,060 (every16 #25, the only m=0 win) | 816 → 96 / 450 |
| conv, endValue | 3 → 3 | 0 | 3 → 3 | 0 | 624 → 96 / 360 |
| conv, lifetimeCost | 20 → 18 | 8; 73,113; 18,068 | 20 → 20 | 0 (one tie changes form) | 720 → 96 / 408 |
| yardstick two-return @75, endValue | win → base | 5,794 | kept (`[1.5,1.5,1]`) | 0 | 38 → 2 / 20 |

- No reduced grid causes an earlier depletion or home draw (`rankBetter` enforces Rule A against base).
- Serial cold times (yardstick 8 + 4 two-return conv households): full grid 0.49–2.5 s (14–38 plannings), `[1,1.5,2]` 0.33–1.4 s, `[1]`
  0.11–0.27 s.
- The 11–19 s two-return households from the Batch 5 notes are not in these samples. The heaviest here is conv #17 (two single returns,
  58, 750k+750k) at 1.7 s.

### Sized trials (`sizing: true` + grid `[0.5,1,1.5,2]`, scratch `lamS`), against shipped Optimize

| Sample / objective | Search wins: shipped → lamS (m≠1) | Better / worse | Net | Rule A failures |
|---|---|---|---|---|
| Yardstick 8, endValue | 1 → 1 | 1 / 1: two-return @100 `[0.5,1,1]` +26,560 (+0.16%); two-return @75 −5,793 (−0.15%, = automatic) | +20,766 | 0 |
| Yardstick 8, lifetimeCost | 8 → 8 (6) | 7 / 0: TX @75 +17,208 (5.0%), TX @100 +147,106 (14.4%), CA @75 +24,241 (6.7%), CA @100 +27,280 (2.0%), NY @75 +53,964 (10.4%), NY @100 +58,025 (5.1%), two-return @100 +177,526 (12.0%) | +505,349 | 0 |
| conv 48, endValue | 3 → 9 (4) | 6 / 0: #3 +0.48%, #11 +2.40%, #15 +1.69%, #21 +0.21%, #23 +0.43%, #45 +3.77% | +71,515 | 0 |
| conv 48, lifetimeCost | 20 → 37 (12) | 29 / 0 (0.1%–1.7% each) | +119,008 | 0 |
| every16 48 (conversions off) | unchanged | 0 / 0 | 0 | 0 |

**Exactness, checked by the cloud session:** 7 winners re-run through `apply` of the recorded plan reproduce the recorded score to the
double. Examples:
- yardstick two-return @100, endValue: 16,344,486.0153 against automatic 16,317,926.0407 (`[0.5,1,1]`, conv at 60-62 plus irmaa1-under
  at 68/70/72/74).
- TX @100, lifetimeCost: −872,939.94 against −1,039,207.14 (`[1.5,1,1]`, `b35` at 55 plus traditional orders).
- conv #15 / #45 / #11, endValue: each matches its recorded score; depletion and home-draw ages equal the automatic plan's.

**Timing gate, checked by the cloud session:** warm, median of 3 runs, serial, Node. The subagent's report wrongly cited a "10 s target";
the gate is B0.11.5's "Optimize at most +40% on the gap households against `cf22985`".

| Gap household | endValue: shipped → lamS (ms) | lifetimeCost: shipped → lamS (ms) |
|---|---|---|
| TX @75 | 659 → 1,058 (+61%) | 1,073 → 2,335 (+118%) |
| TX @100 | 869 → 1,861 (+114%) | 2,347 → 3,185 (+36%) |
| CA @75 | 448 → 774 (+73%) | 442 → 875 (+98%) |
| CA @100 | 586 → 968 (+65%) | 600 → 1,770 (+195%) |
| NY @75 | 563 → 915 (+63%) | 545 → 1,180 (+117%) |
| NY @100 | 653 → 820 (+26%) | 633 → 1,798 (+184%) |
| two-return @75 (not a gap household) | 2,148 → 1,130 | 758 → 812 |
| two-return @100 (not a gap household) | 784 → 1,302 | 786 → 1,195 |

- Shipped is already above `cf22985`, so the true overrun against the gate's base is at least this large. **The gate fails.**
- The planning gate is untouched: `computeCliffPlan` is unchanged, and planning medians are 45–97 ms (gate 250 ms).
- Fewer plannings (136 → 97 on the yardstick endValue run) but each costs more: a sized planning pays 14–21 `apply` runs.

Other risks with sized trials:
- Under lifetimeCost, the sized winners take extreme conversions: TX @100 converts to the top of the 35% bracket at 55, two-return @100
  at 60. That is legitimate under the objective (end tax not counted) but probably needs a summary line or a bound.
- Tests that pin 14 plannings, or `conv: null` on trials (the `plan-search` tests, `order-lever.test.js`), would change.
- `cliff-plan.md`'s line "Optimize therefore no longer combines a multiplier with sizing" would reverse.
- The B0.11.9 toggle-check follow-up (an unsized winner holding orders is checked only unsized) would be resolved as a side effect.

The diff (scratch `lam` → `lamS`), recorded, not recommended at this cost:
```diff
--- lam/src/us/core/cliff-plan/plan-shape.js
+++ lamS/src/us/core/cliff-plan/plan-shape.js
@@ -19 +19 @@
-export const MULT_GRID = Object.freeze([0, 0.5, 1, 1.5, 2]);
+export const MULT_GRID = Object.freeze([0.5, 1, 1.5, 2]);
--- lam/src/us/core/optimizer/plan-search.js
+++ lamS/src/us/core/optimizer/plan-search.js
@@ -118 +118 @@
-    const out = plan(inputs, { mult, objective: obj.id, rankEvenly: true, tieBracket: base.plan.bracket, offMemo, levers, sizing: false }),
+    const out = plan(inputs, { mult, objective: obj.id, rankEvenly: true, tieBracket: base.plan.bracket, offMemo, levers, sizing: true }),
```
Dropping 0 from the grid is optional: it won once, every16 #25 lifetimeCost `[0,1,1]` +8,060. Stored plans carrying 0 need `validMult`
to keep accepting it, or a migration.

Cheaper forms to measure if the owner wants the gain (none tested):
- Size only the best k unsized trials plus base.
- Run the trials with a smaller `apply` budget.
- Size only the phase a trial changes.
- Size trials only for lifetimeCost, which carries most of the gain.

## 9. Not tested

- The 768-household grid, smooth withdrawal mode, levers off with sized trials, the stored-plan (`current`) path, the plan card's rates,
  and the browser.
- Node 24 (everything here ran on Node 22).
- A self-consistent oracle (iterating hindsight and re-planning to a fixed point). It is unlikely to rescue a point estimate.
- `tests/yardstick.mjs` with F was not re-run end to end (only engine-level identity).
- Timing against `cf22985` itself (only shipped against the variant, on one machine).

## 10. Samples and methods

Samples (from `tests/unit/helpers/scan-grid.mjs`):
- **gap:** `GAP_CASES` at life 75 and the default length (6).
- **every16:** `scanHouseholds().filter((_, i) => i % 16 === 0)` (48, conversions off).
- **conv:** `scanHouseholds({ conversions: true }).filter((_, i) => i % 8 === 0)` (48).
- **yardstick:** `tests/yardstick.mjs`'s 8 cases.

Methods:
- **Per household:** the automatic plan; a `choose` trace at the kept plan (plan years per `phaseOf` phase, `movedSample`); then
  `optimizePlan(ctxOf(inputs), { objective })` with the default levers and with `{ order: false, split: false }`, recording the winner,
  `mult`, gain and every trial's measure.
- **Rule A:** checked for every mover: depletion age and first home-draw age against the automatic plan.
- **Timing:** `performance.now()`. The engine pins `Date`.

The scratch copies and outputs were in the cloud container, which is temporary: `lam`, `lamF`, `lamH`, `lamG1`, `lamG3`, `lamS`, the
scripts in `exp/` and the raw JSON in `out/`. Re-create a variant from the diffs above if needed.
