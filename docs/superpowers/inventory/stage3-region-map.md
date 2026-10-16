# Stage 3: where the shared regions went

Generated from `scripts/extractions/stage3.json`. Older notes name shared code by its `@@shared` region; this table says which
module now holds the units of that region that stage 3 extracted (stage 2 did the same: `stage2-region-map.md`). Units of a region
that are not listed in either map were extracted in stage 4 (`stage4-region-map.md`) or were never in a region.
Module paths are those after the stage 4 tidy (`scripts/extractions/stage4-regroup.json` applied: renames, merges and
moves of single declarations), so a region whose units were split by a move is listed once per module.

| old shared region | module |
|---|---|
| 01-LIST_MAX | src/shared/core/list-normalization.js |
| 04-isEstimateCountable | src/shared/core/estimate-checks.js |
| 06-histTaxFactors | src/shared/core/tax-index-factor.js |
| 09-sweepExcessCash | src/shared/core/bond-ladder-rotation.js |
| 10-refillBondReserve | src/shared/core/refill-bond-reserve.js |
| 11-makeProjectedExpense | src/shared/core/projected-expense.js |
| 13-simulate | src/shared/core/simulate.js |
| 14-findMinimalSpendingCut | src/shared/core/find-minimal-spending-cut.js |
| BUCKET_DOWN_YEAR_ORDER | src/shared/core/bucket-down-year-order.js |
| drawTaxable | src/shared/core/draw-taxable.js |
| simulateAtRealCagr | src/shared/core/simulate-at-real-cagr.js |
| takeTaxable | src/shared/core/take-taxable.js |
