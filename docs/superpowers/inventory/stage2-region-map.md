# Stage 2: where the shared regions went

Generated from `scripts/extractions/stage2.json`. Older notes name shared code by its `@@shared` region (for example
`07-mortgagePayment`); this table says which module now holds the units of that region that were extracted. Units of a
region that are not listed here stayed in `main.js` (the region still exists there) or were never in a region.

| old shared region | module |
|---|---|
| 01-LIST_MAX | src/shared/core/lists-and-children.js |
| 02-CHART_GROUPS | src/shared/core/chart-groups.js |
| 03-hadSavedState | src/shared/core/money-format.js |
| 03-hadSavedState | src/shared/ui/money-format.js |
| 04-isEstimateCountable | src/shared/core/estimates-and-warnings.js |
| 04-isEstimateCountable | src/shared/ui/estimates-and-warnings.js |
| 05-pct | src/shared/core/basics.js |
| 06-histTaxFactors | src/shared/core/year-factors.js |
| 07-mortgagePayment | src/shared/core/spending-and-loans.js |
| 07-mortgagePayment | src/shared/ui/chart-colors.js |
| 08-pensionIncome | src/shared/core/pension-income.js |
| 09-sweepExcessCash | src/shared/core/sweep-excess-cash.js |
| 11-makeProjectedExpense | src/shared/core/bond-ladder.js |
| 12-standardYearSource | src/shared/core/year-sources.js |
| 13-simulate | src/shared/core/monte-carlo-paths.js |
| 15-renderPlanHeadline | src/shared/ui/render-plan-headline.js |
| 16-decisionEndAssets | src/shared/core/decision-end-assets.js |
| 19-layoutSankeyColumn | src/shared/core/sankey-layout.js |
| 20-renderTable | src/shared/core/chart-hover.js |
| 20-renderTable | src/shared/ui/chart-render.js |
| 21-writeStorageNow | src/shared/core/scenario-helpers.js |
| 21-writeStorageNow | src/shared/ui/scenario-export.js |
| 22-exportCsv | src/shared/core/dyn-field-helpers.js |
| 23-dynFieldHtml | src/shared/core/dyn-field-html.js |
| 23-dynFieldHtml | src/shared/ui/dyn-field-html.js |
| 25-setMcPathCount | src/shared/ui/landscape-fullscreen.js |
| 26-setChartView | src/shared/ui/topbar-and-undo.js |
| 27-syncKeyboardInset | src/shared/ui/sync-keyboard-inset.js |
| 28-wizardOverlay | src/shared/ui/wizard-overlay.js |
| 29-dismissFirstRunBanner | src/shared/ui/first-run-ui.js |
| compactDecisionDelta | src/shared/core/compact-decision-delta.js |
| ids | src/shared/core/field-wiring.js |
| ids | src/shared/ui/field-wiring.js |
| loanPaymentForYear | src/shared/core/loan-payment-for-year.js |
| nextGuardrailMultiplier | src/shared/core/next-guardrail-multiplier.js |
| SANKEY_HUES | src/shared/core/sankey-hues.js |
| simulateAtRealCagr | src/shared/core/simulate-at-real-cagr.js |
| syncPlanStatusOffsets | src/shared/ui/sync-plan-status-offsets.js |
| takeCash | src/shared/core/take-cash.js |
