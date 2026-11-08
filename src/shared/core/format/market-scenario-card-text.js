// The market scenario card's crash-row summaries and the Depression entry's second-fall note

import { CRASH_PRESETS, crashLegs, presetSecondLeg } from '../inputs/market-scenario-card.js';
import { planLastAge } from '../inputs/plan-last-age.js';

  const yrs = (n) => `${n} ${n === 1 ? 'yr' : 'yrs'}`;
  const years = (n) => `${n} ${n === 1 ? 'year' : 'years'}`;
  const back = (pct, n, unit) => (pct === 0 ? 'no recovery' : pct === 100 ? `all back over ${unit(n)}` : `${pct}% back over ${unit(n)}`);

  // One row of the crash list in one line; a Depression row names itself instead.
  export function crashRowSummary(row) {
    if (crashLegs(row) === 2) return `${CRASH_PRESETS.find((p) => p.id === row.preset).label} at ${row.age} (two falls)`;
    return `${row.drop}% at ${row.age}, ${back(row.recoverPct, row.recoverYears, yrs)}`;
  }

  // The note under a Depression row: its second fall (null for a one-leg row).
  export function secondLegNote(row, inputs) {
    if (crashLegs(row) !== 2) return null;
    const p = CRASH_PRESETS.find((x) => x.id === row.preset),
      leg = presetSecondLeg(p, inputs.returnRate),
      A2 = row.age + leg.ageOffset,
      head = `Then a second fall in ${p.then.fallFrom} (age ${A2})`;
    if (A2 > planLastAge(inputs)) return `${head}, after the plan ends.`;
    return `${head}: ${leg.drop}% drop, ${back(leg.recoverPct, leg.recoverYears, years)}.`;
  }
