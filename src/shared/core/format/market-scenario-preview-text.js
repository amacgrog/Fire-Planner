// The market scenario preview's one-line summary

  // `scenDepletedAge` / `baseDepletedAge` are the age a run's money ran out, or null/undefined when it lasts; `lastAge` is the
  // plan's last age. `scenEnd` / `baseEnd` are each run's final total in today's dollars; `fmt` formats a dollar amount.
  export function previewSummaryText({ scenDepletedAge, baseDepletedAge, lastAge, scenEnd, baseEnd }, fmt) {
    const at = (a) => (a === null || a === undefined ? `age ${lastAge}+` : `age ${a}`),
      a = at(scenDepletedAge),
      b = at(baseDepletedAge),
      ends = `ends with ${fmt(scenEnd)} instead of ${fmt(baseEnd)} (today's $)`;
    return a === b ? `Lasts to ${a} in both · ${ends}` : `Lasts to ${a} instead of ${b} · ${ends}`;
  }
