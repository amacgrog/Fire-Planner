# Stage 3: where the shared regions went

Generated from `scripts/extractions/stage3.json`. Older notes name shared code by its `@@shared` region; this table says which
module now holds the units of that region that stage 3 extracted (stage 2 did the same: `stage2-region-map.md`). Units of a region
that are not listed in either map were extracted in stage 4 (`stage4-region-map.md`) or were never in a region.
Module paths are those after the stage 4 tidy (`scripts/extractions/stage4-regroup.json` applied: renames, merges and
moves of single declarations), so a region whose units were split by a move is listed once per module.

| old shared region | module |
|---|---|
| 01-LIST_MAX | src/shared/core/inputs/lists.js |
| 04-isEstimateCountable | src/shared/core/inputs/estimates.js |
| 06-histTaxFactors | src/shared/core/projection/year-factors.js |
| 09-sweepExcessCash | src/shared/core/withdrawals/bond-ladder.js |
| 10-refillBondReserve | src/shared/core/withdrawals/bond-ladder.js |
| 11-makeProjectedExpense | src/shared/core/income/projected-expense.js |
| 13-simulate | src/shared/core/projection/simulate.js |
| 14-findMinimalSpendingCut | src/shared/core/analysis/decisions.js |
| BUCKET_DOWN_YEAR_ORDER | src/shared/core/withdrawals/bucket-order.js |
| drawTaxable | src/shared/core/withdrawals/draws.js |
| simulateAtRealCagr | src/shared/core/projection/simulate.js |
| takeTaxable | src/shared/core/withdrawals/draws.js |
