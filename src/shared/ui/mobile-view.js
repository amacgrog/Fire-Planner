import { hadSavedState } from './saved-plan.js';
import { syncPlanStatusOffsets } from './sync-plan-status-offsets.js';
import { render } from '#country/ui/seam-render';

  // Assigned by the mobile-tab setup further down; declared here (rather
  // than left to that block alone) so the 'open' questions below can flip
  // to the Dashboard tab before scrolling to a card that lives in
  // .content, which is display:none while the Inputs tab is active.
  export let setMobileView = () => {};
  export function switchToDashboardTab() {
    if (document.getElementById('workspace').dataset.mobileView === 'inputs') setMobileView('dashboard');
  }
  export function wireMobileTabs() {
    // Mobile swappable screens: below the 820px breakpoint the two-column
    // .workspace collapses to one column, so instead of one long stacked
    // scroll (inputs then dashboard) a small tab bar lets the user flip
    // between them; data-mobile-view on #workspace is what the CSS above
    // keys off to hide whichever side isn't active. Desktop ignores the
    // attribute entirely (no CSS rule reads it above 820px). Charts measure
    // their own container width via getBoundingClientRect(), which returns 0
    // while .content is display:none, so switching TO the dashboard tab
    // forces a fresh render() once it's visible again rather than trusting
    // whatever width was measured (or not measured) while hidden.
    // setMobileView is declared with `let` (not wrapped in the usual
    // self-contained IIFE) so DECISION_QUESTIONS' 'sensitivity'/'returns'
    // open() handlers can flip to the Dashboard tab themselves before
    // scrolling to a card that lives in .content — needed since a click can
    // originate from the Inputs tab now that the question row sits above the
    // tab switcher rather than inside .content.
    {
      const workspace = document.getElementById('workspace'),
        tabInputs = document.getElementById('mobileTabInputs'),
        tabDashboard = document.getElementById('mobileTabDashboard');
      setMobileView = function (view) {
        workspace.dataset.mobileView = view;
        tabInputs.classList.toggle('active', view === 'inputs');
        tabInputs.setAttribute('aria-selected', String(view === 'inputs'));
        tabDashboard.classList.toggle('active', view === 'dashboard');
        tabDashboard.setAttribute('aria-selected', String(view === 'dashboard'));
        if (view === 'dashboard') render();
        // .panel is display:none while the Dashboard tab is active, so
        // .mobile-tabs' own offsetHeight (which feeds --mobile-sticky-h,
        // read by .field-search-wrap's sticky top) can go stale while
        // switching between tabs shifts other sticky heights around;
        // switching to Inputs re-measures it fresh rather than trusting
        // whatever was last computed while a different tab was active.
        if (view === 'inputs') syncPlanStatusOffsets();
      };
      tabInputs.addEventListener('click', () => setMobileView('inputs'));
      tabDashboard.addEventListener('click', () => setMobileView('dashboard'));
      // Dashboard is the mobile default for a RETURNING visitor — on load
      // their real plan is already fully computed, so the results are what
      // they should see first, consistent with the Plan status bar's job of
      // always surfacing the model's current answer. But for a FIRST-TIME
      // visitor there's no real plan yet, only the generic example data —
      // "results first" there just means showing someone else's numbers,
      // which is exactly what the (separate) first-run banner already exists
      // to warn about. `hadSavedState` (set at boot from a real localStorage
      // read, before this block runs) is the same signal that already
      // decides whether to skip the first-run banner, so reusing it here
      // keeps first-time vs. returning treated consistently across both
      // features rather than introducing a second, possibly-divergent check.
      setMobileView(hadSavedState ? 'dashboard' : 'inputs');
    }
    // Mobile-only "minimize sticky header" toggle: collapses the
    // Inputs/Dashboard tab switcher + the field search box (the two sticky
    // bars beneath the Plan Status Bar) to reclaim vertical space, most
    // useful once the on-screen keyboard is open and eating a big chunk of
    // an already-small viewport. Deliberately excludes the Plan Status Bar
    // itself (that one's meant to always stay visible as "the answer"; this
    // toggle only ever touches navigation/search chrome) and is a pure
    // display toggle, not part of `state` — same reasoning as `logScale`/
    // `chartView`/mobile-tab-view, none of which persist across reloads
    // either. The toggle button itself is `position:fixed` (not part of the
    // sticky stack it controls) so it stays reachable to re-expand
    // regardless of collapsed state, with no extra sticky-offset math needed.
    {
      const headerToggle = document.getElementById('mobileHeaderToggle');
      if (headerToggle) {
        headerToggle.addEventListener('click', () => {
          const collapsed = document.body.classList.toggle('mobile-header-collapsed');
          headerToggle.textContent = collapsed ? '⌄' : '︿';
          headerToggle.setAttribute('aria-expanded', String(!collapsed));
          headerToggle.setAttribute('aria-label', collapsed ? 'Show tabs and search' : 'Hide tabs and search');
          // .mobile-tabs/.field-search-wrap's offsetHeight reads 0 while
          // hidden, so re-measure once they're visible again on expand —
          // harmless (cheap) to call unconditionally on collapse too.
          syncPlanStatusOffsets();
        });
      }
    }
  }
