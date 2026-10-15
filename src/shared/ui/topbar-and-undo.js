  export const undoToastBtnEl = document.getElementById('undoToastBtn');
  export function syncTopbarHeight() {
    const tb = document.querySelector('.topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  }
