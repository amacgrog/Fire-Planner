import { mode, assignState } from '../shared/core/store.js';
import { REVEAL_BY_ID } from './core/normalize-lists.js';
import { syncTopbarHeight } from '../shared/ui/topbar-and-undo.js';
import { syncKeyboardInset, syncPanelMaxHeight } from '../shared/ui/sync-keyboard-inset.js';
import { FIELDS } from './ui/clamp-profit-sharing.js';
import { normalizeState } from './ui/normalize-state.js';
import { wireCategoryRail } from '../shared/ui/category-rail.js';
import { wireInfoBubble } from '../shared/ui/info-bubble.js';
import { wireInputGestures } from '../shared/ui/input-gestures.js';
import { installSharedTestHooks } from '../shared/ui/install-test-hooks.js';
import { loadSidebarPreference, wireSidebarCollapse } from '../shared/ui/sidebar.js';
import { wireTableFocus } from '../shared/ui/table-focus.js';
import { wireWizard, wireWizardDismiss } from '../shared/ui/wizard.js';
import { addChildrenList } from './ui/dynamic-lists.js';
import { addSocialSecurityWarnings } from './ui/unusual-warnings.js';
import { wireWizardCheckboxes } from './ui/wizard.js';
import { syncContributionControls } from '../shared/ui/sync-contribution-controls.js';
import { syncControls } from './ui/sync-controls.js';
import { dismissFirstRunBanner, hadSavedState, loadSavedState, wireFirstRunBanner } from '../shared/ui/saved-plan.js';
import { initChartHover } from '../shared/ui/chart-hover.js';
import { wireExportButtons } from '../shared/ui/export-and-print.js';
import { wireAutosave } from '../shared/ui/autosave.js';
import { wireMobileTabs } from '../shared/ui/mobile-view.js';
import { setMode } from '../shared/ui/chart-view-mode.js';
import { wireSensitivityCard } from '../shared/ui/tornado.js';
import { wireDecisionCard, wireDecisionQuestions } from '../shared/ui/decision-questions.js';
import { wireEstimateBadges } from '../shared/ui/estimate-badges.js';
import { wireEstimateReview } from '../shared/ui/estimate-review.js';
import { wirePlanStatusBar } from '../shared/ui/plan-status-bar.js';
import { wireSankeyAge, wireSankeyCard } from '../shared/ui/sankey.js';
import { wireUnusualWarnings } from '../shared/ui/unusual-warnings.js';
import { wireChartToolbar, wireDollarModeDropdown } from '../shared/ui/chart-toolbar.js';
import { wireRothOptimizerControls } from './ui/roth-optimizer-controls.js';
import { wireDisclaimerLink } from '../shared/ui/disclaimer-link.js';
import { wireDynamicListEditing } from '../shared/ui/dynamic-list-editing.js';
import { wireFieldListeners } from '../shared/ui/field-listeners.js';
import { wireFieldSearch } from '../shared/ui/field-search.js';
import { wireHeadlineTiles } from '../shared/ui/headline-tiles.js';
import { wireHousingButtons } from '../shared/ui/housing-buttons.js';
import { wireLayoutListeners } from '../shared/ui/layout.js';
import { registerMcpTools } from '../shared/ui/mcp-tools.js';
import { wireScenarios } from '../shared/ui/scenarios.js';
import { wireThemeToggle } from '../shared/ui/theme.js';
import { wireUndoButton } from '../shared/ui/undo-2.js';
import { wireWizardClose } from '../shared/ui/wizard-2.js';
import { wireChartShiftButtons, wireChartViewButtons } from './ui/chart-controls.js';
import { wireContributionButtons } from './ui/contribution-buttons.js';
import { wireFilingStatusButtons } from './ui/filing-status-buttons.js';
import { wirePensionButtons } from './ui/pension-buttons.js';
import { wireSensitivityLevers } from './ui/sensitivity.js';
import { wireResetButton } from '../shared/ui/reset-plan.js';
import { installTestHooks } from './ui/install-test-hooks.js';
(() => {
  FIELDS.forEach((f) => (f.reveals || []).forEach((r) => REVEAL_BY_ID.set(r.id, r.hidden)));
  assignState(normalizeState(null));
  loadSidebarPreference();
  loadSavedState();
  wireEstimateBadges();
  wireInfoBubble();

  wireEstimateReview();
  wireUnusualWarnings();
  addSocialSecurityWarnings();
  // Tax-parameter indexing. Brackets, deductions, FPL, IRMAA tiers and the
  // FICA wage base all index by this factor. In the deterministic projection
  // it is the steady state.inflation compounded by yearIndex; inside
  // simulateHistorical() (backtest and Monte Carlo) it is the path's own
  // cumulative CPI, so a 1970s-style inflation sequence raises the brackets
  // along with spending instead of leaving them on a 2.5% schedule.


























  // ---- end withdrawal building blocks ----




  // ---- end per-year helpers ----






  // Real-CAGR sweep: temporarily overrides the nominal investment return with
  // the nominal rate equivalent to the given real CAGR compounded on top of
  // the current inflation input, then restores it. Bond/HYSA yields and
  // retirement dates are left untouched, so this isolates sensitivity to the
  // main portfolio return assumption alone.
  // "What's driving this" shortfall analysis: when the selected projection
  // shows a depletion age, first tests "structural" single-lever changes tied
  // to a specific input (LTC off, healthcare premiums off) by temporarily
  // mutating state and re-running simulate(), then restoring state exactly —
  // same mutate/simulate/restore pattern as simulateAtRealCagr(). These













  wireAutosave();

  addChildrenList();
  wireDynamicListEditing();
  wireFieldListeners();
  wireHousingButtons();
  wireExportButtons();
  wireFieldSearch();
  wireHeadlineTiles();
  wireContributionButtons();
  wirePensionButtons();
  wireFilingStatusButtons();
  wireChartViewButtons();
  wireDollarModeDropdown();
  wireDisclaimerLink();
  wireChartToolbar();
  wireChartShiftButtons();
  wireUndoButton();
  wireResetButton();
  wireInputGestures();
  wirePlanStatusBar();
  wireScenarios();
  wireThemeToggle();
  wireSidebarCollapse();
  wireCategoryRail();
  wireLayoutListeners();
  wireWizardCheckboxes();
  wireWizard();
  wireWizardClose();
  wireWizardDismiss();
  wireSensitivityCard();
  wireSensitivityLevers();
  wireRothOptimizerControls();
  wireSankeyCard();
  wireDecisionCard();
  wireSankeyAge();
  wireFirstRunBanner();
  wireDecisionQuestions();
  wireMobileTabs();

  if (hadSavedState) dismissFirstRunBanner();
  syncControls();
  syncContributionControls();
  setMode(mode);
  syncTopbarHeight();
  syncPanelMaxHeight();
  syncKeyboardInset();
  initChartHover();

  wireTableFocus();

  registerMcpTools();
  installSharedTestHooks();
  installTestHooks();
})();
