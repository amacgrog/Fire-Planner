  // Best-effort only: real browser Fullscreen (which also hides the
  // mobile address bar) plus a landscape orientation lock, attempted
  // together since Chrome/Android requires the page to already be in
  // Fullscreen before it will grant an orientation lock at all. Neither
  // API is required for the expand feature to work — the CSS overlay
  // above is the actual mechanism, functional with or without this —
  // this only reaches for the nicer outcome where the browser supports
  // it (mainly Android Chrome) and silently does nothing everywhere else
  // (notably iOS Safari, which supports neither API for a plain <div>).
  export async function tryEnterLandscapeFullscreen() {
    try {
      const el = document.getElementById('mainChartCard');
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (err) {
      // Unsupported or denied (e.g. iOS Safari, or a desktop browser with
      // no orientation to lock) — the CSS overlay already covers the
      // viewport regardless, so there's nothing to recover from here.
    }
  }
  export function tryExitLandscapeFullscreen() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (err) {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
