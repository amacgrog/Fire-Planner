  // `#reviewNav` (the floating "Next →" pill) is `position:fixed;bottom:...`,
  // anchored to the bottom of the *layout* viewport. When the on-screen
  // keyboard opens for a focused text field, mobile browsers typically leave
  // the layout viewport's height alone and only shrink the *visual*
  // viewport -- so a plain fixed-bottom element ends up positioned behind
  // the keyboard, off the bottom of what's actually visible, which is
  // exactly the reported symptom ("covered up by the number pad ... can't
  // click it when editing a text field"). The fix is the standard one for
  // this class of bug: track `window.visualViewport` (widely supported on
  // mobile browsers) and feed the gap between the layout and visual
  // viewports into a CSS var the fixed element's `bottom` already reads, so
  // it rides up above the keyboard instead of staying pinned under it.
  export function syncKeyboardInset() {
    const vv = window.visualViewport;
    if (!vv) return;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', inset + 'px');
  }
  // The sidebar (`.panel`) is position:sticky with a max-height so it scrolls
  // internally rather than growing past the viewport — but its max-height
  // used to be sized only against the sticky `top` offset it settles into
  // *once scrolled*, not its natural (pre-scroll) position in the page flow,
  // which sits further down (below the topbar, the Plan Status Bar, and the
  // first-run banner when shown). Since that natural position is always
  // lower than the eventual sticky one, sizing against the sticky offset
  // alone left the sidebar's rendered box taller than the space actually
  // available before any scrolling — its bottom edge sat below the fold,
  // so seeing it required scrolling the whole page (not just the sidebar's
  // own internal scroll). Measuring the leading elements directly (rather
  // than `.panel`'s own getBoundingClientRect(), which reports its already-
  // pinned position once sticky has engaged, not its natural one) keeps
  // this correct regardless of current scroll position.
  export function syncPanelMaxHeight() {
    const panel = document.querySelector('.panel');
    if (!panel || window.innerWidth <= 820) return; // mobile: .panel is position:static, no max-height to size
    const disclaimer = document.querySelector('.top-disclaimer'),
      topbar = document.querySelector('.topbar'),
      bar = document.getElementById('planStatusBar'),
      banner = document.getElementById('firstRunBanner'),
      mainEl = document.querySelector('main'),
      heightOf = (el) =>
        el && !el.hidden ? el.offsetHeight + (parseFloat(getComputedStyle(el).marginBottom) || 0) : 0,
      mainPad = mainEl ? parseFloat(getComputedStyle(mainEl).paddingTop) || 0 : 0,
      naturalTop = heightOf(disclaimer) + heightOf(topbar) + mainPad + heightOf(bar) + heightOf(banner),
      maxH = Math.max(240, window.innerHeight - naturalTop - 22);
    document.documentElement.style.setProperty('--panel-max-h', maxH + 'px');
  }
