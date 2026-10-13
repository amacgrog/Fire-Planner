# Stage 3: where the shared regions went

Generated from `scripts/extractions/stage3.json`. Older notes name shared code by its `@@shared` region; this table says which
module now holds the units of that region that stage 3 extracted (stage 2 did the same: `stage2-region-map.md`). Units of a region
that are not listed in either map stayed in `main.js` (the region still exists there) or were never in a region.

| old shared region | module |
|---|---|
| 01-LIST_MAX | src/shared/core/lists-and-children-2.js |
| 04-isEstimateCountable | src/shared/core/estimates-and-warnings-2.js |
| 06-histTaxFactors | src/shared/core/year-factors-2.js |
| 09-sweepExcessCash | src/shared/core/sweep-excess-cash-2.js |
| 10-refillBondReserve | src/shared/core/refill-bond-reserve.js |
| 11-makeProjectedExpense | src/shared/core/bond-ladder-2.js |
| 13-simulate | src/shared/core/monte-carlo-paths-2.js |
| 14-findMinimalSpendingCut | src/shared/core/find-minimal-spending-cut.js |
| BUCKET_DOWN_YEAR_ORDER | src/shared/core/bucket-down-year-order.js |
| drawTaxable | src/shared/core/draw-taxable.js |
| simulateAtRealCagr | src/shared/core/simulate-at-real-cagr-2.js |
| takeTaxable | src/shared/core/take-taxable.js |
