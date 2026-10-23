// CURRENT_YEAR: the device clock's calendar year, read once at load (outside the engine: adapters and the UI import it)

  // load-time: reads the device clock (new Date()) once; reads no other name
  // Real calendar year for row.year === 0 ("now"), used to label the
  // chart x-axis in 'year' mode (and Canada's tax year, through its store context) — computed once from the device clock
  // rather than hardcoded, unlike the "2026 dollars" real-dollar-mode
  // label elsewhere, since a chart axis that's visibly wrong past this
  // year would be a lot more obviously broken than a dollar-mode label.
  export const CURRENT_YEAR = new Date().getFullYear();
