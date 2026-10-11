// The calendar year the tax code is evaluated from. A live binding so tests can pin it
// (window.__test_setCurrentYear). No DOM access.

export let currentYear = new Date().getFullYear();

export function assignCurrentYear(next) {
  currentYear = next;
}
