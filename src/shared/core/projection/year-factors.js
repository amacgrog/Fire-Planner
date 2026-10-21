  // Real calendar year for row.year === 0 ("now"), used only to label the
  // chart x-axis in 'year' mode — computed once from the device clock
  // rather than hardcoded, unlike the "2026 dollars" real-dollar-mode
  // label elsewhere, since a chart axis that's visibly wrong past this
  // year would be a lot more obviously broken than a dollar-mode label.
  export const CURRENT_YEAR = new Date().getFullYear();
