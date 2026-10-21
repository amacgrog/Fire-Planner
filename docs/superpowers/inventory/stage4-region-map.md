# Stage 4: where the shared regions went

Generated from `scripts/extractions/stage4.json` (every batch's modules and units) with `scripts/extractions/stage4-regroup.json`
applied, and the unit-to-region table of the rehearsal inventory (`2c1064f`). Stage 4 emptied the 21 `@@shared` regions that were
left after stage 3; this table says which module now holds the units of each (a region's units extracted in stages 2 and 3 are in
`stage2-region-map.md` and `stage3-region-map.md`). Module paths are final (after the tidy's renames, merges and moves). The
eight boot statements of region 29 (`if (hadSavedState) dismissFirstRunBanner();` through `initChartHover();`) stay in each
planner's `main.js`, pinned there by the topics file. Every other statement of a region moved into a wiring function of the module
listed, and `main.js` calls that function where the statements used to run. No region, marker or `shared/` fragment is left.

| old shared region | module |
|---|---|
| 02-CHART_GROUPS | src/shared/ui/layout/sidebar.js |
| 02-CHART_GROUPS | src/shared/ui/layout/theme.js |
| 03-hadSavedState | src/shared/ui/inputs/estimate-badges.js |
| 03-hadSavedState | src/shared/ui/plans/saved-plan.js |
| 04-isEstimateCountable | src/shared/ui/inputs/estimate-badges.js |
| 04-isEstimateCountable | src/shared/ui/inputs/estimate-review.js |
| 04-isEstimateCountable | src/shared/ui/inputs/info-bubble.js |
| 04-isEstimateCountable | src/shared/ui/results/unusual-warnings.js |
| 15-renderPlanHeadline | src/shared/ui/results/shortfall-banner.js |
| 17-renderDecisionQuestionPreviews | src/shared/ui/results/decision-questions.js |
| 17-renderDecisionQuestionPreviews | src/shared/ui/layout/mobile-view.js |
| 18-computeSensitivity | src/shared/ui/charts/tornado.js |
| 19-layoutSankeyColumn | src/shared/ui/results/roth-optimizer-card.js |
| 19-layoutSankeyColumn | src/shared/ui/charts/sankey.js |
| 20-renderTable | src/shared/ui/charts/chart-hover.js |
| 20-renderTable | src/shared/ui/charts/projection-chart.js |
| 21-writeStorageNow | src/shared/ui/plans/autosave.js |
| 21-writeStorageNow | src/shared/ui/plans/scenario-comparison.js |
| 21-writeStorageNow | src/shared/ui/plans/scenarios.js |
| 22-exportCsv | src/shared/ui/plans/export-and-print.js |
| 23-dynFieldHtml | src/shared/ui/inputs/dynamic-list-editing.js |
| 23-dynFieldHtml | src/shared/ui/inputs/dynamic-lists.js |
| 24-syncContributionControls | src/shared/ui/plans/export-and-print.js |
| 24-syncContributionControls | src/shared/ui/inputs/field-listeners.js |
| 24-syncContributionControls | src/shared/ui/inputs/field-search.js |
| 24-syncContributionControls | src/shared/ui/results/headline-tiles.js |
| 24-syncContributionControls | src/shared/ui/inputs/housing-buttons.js |
| 24-syncContributionControls | src/shared/ui/inputs/sync-contribution-controls.js |
| 25-setMcPathCount | src/shared/ui/charts/chart-toolbar.js |
| 25-setMcPathCount | src/shared/ui/layout/disclaimer-link.js |
| 26-setChartView | src/shared/ui/charts/chart-view-mode.js |
| 26-setChartView | src/shared/ui/plans/reset-plan.js |
| 26-setChartView | src/shared/ui/plans/undo.js |
| 27-syncKeyboardInset | src/shared/ui/inputs/category-rail.js |
| 27-syncKeyboardInset | src/shared/ui/inputs/input-gestures.js |
| 27-syncKeyboardInset | src/shared/ui/layout/layout-listeners.js |
| 27-syncKeyboardInset | src/shared/ui/results/plan-status-bar.js |
| 27-syncKeyboardInset | src/shared/ui/plans/scenarios.js |
| 27-syncKeyboardInset | src/shared/ui/layout/sidebar.js |
| 27-syncKeyboardInset | src/shared/ui/layout/theme.js |
| 28-wizardOverlay | src/shared/ui/charts/tornado.js |
| 28-wizardOverlay | src/shared/ui/wizard.js |
| 29-dismissFirstRunBanner | src/<country>/main.js (the boot sequence, pinned to main) |
| 29-dismissFirstRunBanner | src/shared/ui/results/decision-questions.js |
| 29-dismissFirstRunBanner | src/shared/ui/mcp-tools.js |
| 29-dismissFirstRunBanner | src/shared/ui/layout/mobile-view.js |
| 29-dismissFirstRunBanner | src/shared/ui/charts/sankey.js |
| 29-dismissFirstRunBanner | src/shared/ui/plans/saved-plan.js |
| 29-dismissFirstRunBanner | src/shared/ui/results/table-focus.js |
| activeCategory | src/shared/ui/inputs/category-rail.js |
| block | src/shared/ui/install-test-hooks.js |
| ids | src/shared/ui/inputs/field-ids.js |
| ids | src/shared/ui/inputs/field-listeners.js |
| ids | src/shared/ui/mcp-tools.js |
| renderTornadoChart | src/shared/ui/charts/tornado.js |
