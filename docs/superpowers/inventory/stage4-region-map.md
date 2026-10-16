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
| 02-CHART_GROUPS | src/shared/ui/sidebar.js |
| 02-CHART_GROUPS | src/shared/ui/theme.js |
| 03-hadSavedState | src/shared/ui/estimate-badges.js |
| 03-hadSavedState | src/shared/ui/saved-plan.js |
| 04-isEstimateCountable | src/shared/ui/estimate-badges.js |
| 04-isEstimateCountable | src/shared/ui/estimate-review.js |
| 04-isEstimateCountable | src/shared/ui/info-bubble.js |
| 04-isEstimateCountable | src/shared/ui/unusual-warnings.js |
| 15-renderPlanHeadline | src/shared/ui/shortfall-banner.js |
| 17-renderDecisionQuestionPreviews | src/shared/ui/decision-questions.js |
| 17-renderDecisionQuestionPreviews | src/shared/ui/mobile-view.js |
| 18-computeSensitivity | src/shared/ui/tornado.js |
| 19-layoutSankeyColumn | src/shared/ui/roth-optimizer-card.js |
| 19-layoutSankeyColumn | src/shared/ui/sankey.js |
| 20-renderTable | src/shared/ui/chart-hover.js |
| 20-renderTable | src/shared/ui/projection-chart.js |
| 21-writeStorageNow | src/shared/ui/autosave.js |
| 21-writeStorageNow | src/shared/ui/scenario-comparison.js |
| 21-writeStorageNow | src/shared/ui/scenarios.js |
| 22-exportCsv | src/shared/ui/export-and-print.js |
| 23-dynFieldHtml | src/shared/ui/dynamic-list-editing.js |
| 23-dynFieldHtml | src/shared/ui/dynamic-lists.js |
| 24-syncContributionControls | src/shared/ui/export-and-print.js |
| 24-syncContributionControls | src/shared/ui/field-listeners.js |
| 24-syncContributionControls | src/shared/ui/field-search.js |
| 24-syncContributionControls | src/shared/ui/headline-tiles.js |
| 24-syncContributionControls | src/shared/ui/housing-buttons.js |
| 24-syncContributionControls | src/shared/ui/sync-contribution-controls.js |
| 25-setMcPathCount | src/shared/ui/chart-toolbar.js |
| 25-setMcPathCount | src/shared/ui/disclaimer-link.js |
| 26-setChartView | src/shared/ui/chart-view-mode.js |
| 26-setChartView | src/shared/ui/reset-plan.js |
| 26-setChartView | src/shared/ui/undo.js |
| 27-syncKeyboardInset | src/shared/ui/category-rail.js |
| 27-syncKeyboardInset | src/shared/ui/input-gestures.js |
| 27-syncKeyboardInset | src/shared/ui/layout-listeners.js |
| 27-syncKeyboardInset | src/shared/ui/plan-status-bar.js |
| 27-syncKeyboardInset | src/shared/ui/scenarios.js |
| 27-syncKeyboardInset | src/shared/ui/sidebar.js |
| 27-syncKeyboardInset | src/shared/ui/theme.js |
| 28-wizardOverlay | src/shared/ui/tornado.js |
| 28-wizardOverlay | src/shared/ui/wizard.js |
| 29-dismissFirstRunBanner | src/<country>/main.js (the boot sequence, pinned to main) |
| 29-dismissFirstRunBanner | src/shared/ui/decision-questions.js |
| 29-dismissFirstRunBanner | src/shared/ui/mcp-tools.js |
| 29-dismissFirstRunBanner | src/shared/ui/mobile-view.js |
| 29-dismissFirstRunBanner | src/shared/ui/sankey.js |
| 29-dismissFirstRunBanner | src/shared/ui/saved-plan.js |
| 29-dismissFirstRunBanner | src/shared/ui/table-focus.js |
| activeCategory | src/shared/ui/category-rail.js |
| block | src/shared/ui/install-test-hooks.js |
| ids | src/shared/ui/field-ids.js |
| ids | src/shared/ui/field-listeners.js |
| ids | src/shared/ui/mcp-tools.js |
| renderTornadoChart | src/shared/ui/tornado.js |
