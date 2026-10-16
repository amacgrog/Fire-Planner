import { activeCategory, setActiveCategory } from './category-rail.js';
import { syncKeyboardInset, syncPanelMaxHeight } from './sync-keyboard-inset.js';
import { syncTopbarHeight } from './topbar-and-undo.js';
import { render } from '#country/ui/seam-render';

  export function wireLayoutListeners() {
    // Charts measure their canvas via getBoundingClientRect(), which is only
    // correct once .workspace's grid-template-columns transition has
    // actually finished (same reasoning as the chart-expand feature's
    // double-rAF re-render) — re-render once that transition ends rather
    // than mid-animation, so the main/tornado/overlay/Sankey charts end up
    // sized to the panel's new (or restored) width, not its old one.
    document.getElementById('workspace').addEventListener('transitionend', (e) => {
      if (e.propertyName === 'grid-template-columns') {
        render();
        syncTopbarHeight();
        syncPanelMaxHeight();
      }
    });
    window.addEventListener('resize', () => {
      render();
      syncTopbarHeight();
      syncPanelMaxHeight();
      // Re-applies the current category filter against the new width's
      // isDesktop check — on mobile this always shows every group
      // (setActiveCategory's own isDesktop guard), so a filter chosen on
      // desktop can never strand a resized-down mobile view with groups
      // hidden and no rail visible to unhide them, and resizing back up
      // restores that same filter rather than silently forgetting it.
      setActiveCategory(activeCategory);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncKeyboardInset);
      window.visualViewport.addEventListener('scroll', syncKeyboardInset);
    }
  }
