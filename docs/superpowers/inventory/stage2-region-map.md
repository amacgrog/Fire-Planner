# Stage 2: where the shared regions went

Generated from `scripts/extractions/stage2.json`. Older notes name shared code by its `@@shared` region (for example
`07-mortgagePayment`); this table says which module now holds the units of that region that were extracted. Units of a
region that are not listed here were extracted later (`stage3-region-map.md`, `stage4-region-map.md`) or were never in a region.
Module paths are those after the stage 4 tidy (`scripts/extractions/stage4-regroup.json` applied: renames, merges and
moves of single declarations), so a region whose units were split by a move is listed once per module.

| old shared region | module |
|---|---|
| 01-LIST_MAX | src/shared/core/inputs/lists.js |
| 02-CHART_GROUPS | src/shared/core/format/charts.js |
| 03-hadSavedState | src/shared/core/format/numbers.js |
| 03-hadSavedState | src/shared/ui/inputs/money-format.js |
| 04-isEstimateCountable | src/shared/core/inputs/estimates.js |
| 04-isEstimateCountable | src/shared/ui/inputs/info-bubble.js |
| 04-isEstimateCountable | src/shared/ui/results/unusual-warnings.js |
| 05-pct | src/shared/core/format/numbers.js |
| 06-histTaxFactors | src/shared/core/projection/year-factors.js |
| 07-mortgagePayment | src/shared/core/income/spending-and-loans.js |
| 07-mortgagePayment | src/shared/ui/charts/chart-colors.js |
| 08-pensionIncome | src/shared/core/income/pension-income.js |
| 09-sweepExcessCash | src/shared/core/withdrawals/draws.js |
| 11-makeProjectedExpense | src/shared/core/withdrawals/bond-ladder.js |
| 12-standardYearSource | src/shared/core/projection/year-sources.js |
| 13-simulate | src/shared/core/projection/simulate.js |
| 15-renderPlanHeadline | src/shared/ui/results/render-plan-headline.js |
| 16-decisionEndAssets | src/shared/core/analysis/decisions.js |
| 19-layoutSankeyColumn | src/shared/core/format/sankey-layout.js |
| 20-renderTable | src/shared/core/format/charts.js |
| 20-renderTable | src/shared/ui/charts/monte-carlo-chart.js |
| 20-renderTable | src/shared/ui/results/projection-table.js |
| 21-writeStorageNow | src/shared/core/analysis/scenario-helpers.js |
| 21-writeStorageNow | src/shared/ui/plans/scenario-export.js |
| 22-exportCsv | src/shared/core/inputs/dyn-fields.js |
| 23-dynFieldHtml | src/shared/core/inputs/dyn-fields.js |
| 23-dynFieldHtml | src/shared/ui/inputs/field-dom-sync.js |
| 25-setMcPathCount | src/shared/ui/charts/landscape-fullscreen.js |
| 26-setChartView | src/shared/ui/layout/layout-metrics.js |
| 26-setChartView | src/shared/ui/plans/undo.js |
| 27-syncKeyboardInset | src/shared/ui/layout/layout-metrics.js |
| 28-wizardOverlay | src/shared/ui/wizard.js |
| 29-dismissFirstRunBanner | src/shared/ui/mcp-tools.js |
| 29-dismissFirstRunBanner | src/shared/ui/results/table-focus.js |
| compactDecisionDelta | src/shared/core/analysis/decisions.js |
| ids | src/shared/core/inputs/dyn-fields.js |
| ids | src/shared/ui/inputs/field-dom-sync.js |
| loanPaymentForYear | src/shared/core/income/spending-and-loans.js |
| nextGuardrailMultiplier | src/shared/core/projection/guardrails.js |
| SANKEY_HUES | src/shared/core/format/charts.js |
| simulateAtRealCagr | src/shared/core/format/charts.js |
| syncPlanStatusOffsets | src/shared/ui/layout/layout-metrics.js |
| takeCash | src/shared/core/withdrawals/draws.js |
