// The shared info bubble opened by the info buttons

  let infoBubbleBtn = null;
  let infoBubbleAnchor = { top: 0, left: 0 };
  function closeInfoBubble(returnFocus) {
    if (!infoBubbleBtn) return;
    const btn = infoBubbleBtn;
    infoBubbleBtn = null;
    infoBubble.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-describedby');
    if (returnFocus && btn.isConnected) btn.focus();
  }
  function placeInfoBubble() {
    if (!infoBubbleBtn || !infoBubbleBtn.isConnected) {
      closeInfoBubble(false);
      return;
    }
    const r = infoBubbleBtn.getBoundingClientRect(),
      vw = document.documentElement.clientWidth,
      vh = window.innerHeight,
      bw = infoBubble.offsetWidth,
      bh = infoBubble.offsetHeight,
      gap = 8,
      margin = 12;
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - bw / 2), Math.max(margin, vw - bw - margin));
    let top = r.bottom + gap;
    if (top + bh > vh - margin && r.top - gap - bh >= margin) top = r.top - gap - bh;
    infoBubble.style.left = left + 'px';
    infoBubble.style.top = Math.max(margin, top) + 'px';
  }
  function openInfoBubble(btn) {
    closeInfoBubble(false);
    infoBubble.textContent = btn.dataset.tip || '';
    infoBubble.hidden = false;
    infoBubbleBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-describedby', 'infoBubble');
    placeInfoBubble();
    const ar = btn.getBoundingClientRect();
    infoBubbleAnchor = { top: ar.top, left: ar.left };
  }
  export function wireInfoBubble() {
    infoBubble.id = 'infoBubble';
    infoBubble.className = 'info-bubble';
    infoBubble.setAttribute('role', 'tooltip');
    infoBubble.hidden = true;
    document.body.appendChild(infoBubble);
    document.addEventListener('click', (e) => {
      const btn = e.target.closest ? e.target.closest('.info-tip') : null;
      if (btn) {
        e.preventDefault();
        if (infoBubbleBtn === btn) closeInfoBubble(false);
        else openInfoBubble(btn);
        return;
      }
      if (infoBubbleBtn && !infoBubble.contains(e.target)) closeInfoBubble(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && infoBubbleBtn) closeInfoBubble(true);
    });
    // Close on scroll only once the button has actually moved — a browser can
    // fire a stray scroll event right after a tap (focus/scroll-into-view) that
    // shouldn't dismiss the bubble that tap just opened.
    document.addEventListener(
      'scroll',
      (e) => {
        if (!infoBubbleBtn || infoBubble.contains(e.target)) return;
        const r = infoBubbleBtn.getBoundingClientRect();
        if (!infoBubbleBtn.isConnected || Math.abs(r.top - infoBubbleAnchor.top) > 4 || Math.abs(r.left - infoBubbleAnchor.left) > 4)
          closeInfoBubble(false);
      },
      true,
    );
    window.addEventListener('resize', () => closeInfoBubble(false));
  }
  // load-time: creates the bubble element; reads nothing a statement writes.
  // ---- Info bubbles: the small "i" buttons next to field labels -----------
  // Short descriptors live in each field's <small>; anything longer lives in
  // the button's data-tip and opens in this one shared, fixed-position bubble
  // (fixed + appended to <body> so the sidebar's scroll container can't clip
  // it). Click/tap or Enter/Space opens it; click elsewhere, Escape, scroll,
  // or resize closes it. The buttons sit inside the field's <label for=...>,
  // so the delegated handler must preventDefault() — otherwise the browser's
  // label activation would focus/toggle the very control the label points at.
  const infoBubble = document.createElement('div');
