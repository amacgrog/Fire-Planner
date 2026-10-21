// currentYear: the calendar year the US tax code is evaluated from, with assign

// The calendar year the tax code is evaluated from. A live binding so tests can pin it
// (window.__test_setCurrentYear). No DOM access.

// load-time: reads the device clock (new Date()) once; reads no other name
export let currentYear = new Date().getFullYear();

export function assignCurrentYear(next) {
  currentYear = next;
}
