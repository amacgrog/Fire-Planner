import { render } from '#country/ui/seam-render';

  // load-time: reads window.matchMedia; reads nothing a statement writes.
  // Theme isn't part of state or scenarios (it's a display preference, not
  // a financial input) and, unlike state/mode below, is deliberately not
  // persisted — it just starts from the OS/browser preference each time the
  // page loads, so it always reflects whatever the person's system is set
  // to right now rather than freezing whatever it happened to be at last
  // save.
  let theme =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    render();
  }
  export function wireThemeToggle() {
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      applyTheme();
    });
    applyTheme();
  }
