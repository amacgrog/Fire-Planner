// The one-line description of a market scenario (banner, report, CSV)

import { HIST } from '../projection/historical-data.js';

  const years = (n) => `${n} ${n === 1 ? 'year' : 'years'}`;

  // The plan's last age L: runProjection's loop runs `year <= projectionYears`, with projectionYears the longer
  // life-expectancy gap (partner A's alone for a single person), so L = ageA + projectionYears.
  export function planLastAge(inputs) {
    const ageA = inputs.ageA;
    return (
      ageA +
      (inputs.singlePerson
        ? Math.max(0, inputs.lifeExpectancyA - ageA)
        : Math.max(0, inputs.lifeExpectancyA - ageA, inputs.lifeExpectancyB - inputs.ageB))
    );
  }

  // `ms` is a normalized marketScenario. Names the ages and years the source runs, after its own clamps (L, the plan's last age).
  export function describeMarketScenario(ms, inputs, currentYear) {
    const ageA = inputs.ageA,
      L = planLastAge(inputs),
      order = ms.order === 'standard' ? 'your normal withdrawal order' : 'bonds first in down years';
    let body;
    if (ms.kind === 'plan') {
      body = "your plan's own rates";
    } else if (ms.kind === 'crash') {
      body = ms.crashes
        .map((c) => {
          const A = ageA + Math.max(0, Math.round(c.age - ageA));
          // a crash past the plan's last age runs nothing: no recovery or rate phrase for it
          if (A > L) return `${c.drop}% drop at age ${A}: after the plan ends`;
          const head = `${c.drop}% drop at age ${A} (${currentYear + (A - ageA)}) over ${years(c.fallYears)}`,
            back =
              c.recoverPct === 0
                ? 'no recovery'
                : c.recoverPct === 100
                  ? `back on the plan's line over ${years(c.recoverYears)}`
                  : `${c.recoverPct}% recovered over ${years(c.recoverYears)}`;
          return `${head}, ${back}, inflation ${c.inflation}% and bonds ${c.bondReturn > 0 ? '+' : ''}${c.bondReturn}% a year during the fall`;
        })
        .join('; then ');
    } else {
      const h = ms.history,
        A1 = ageA + Math.max(0, h.atAge - ageA),
        Y1 = h.startYear + (A1 - h.atAge),
        lastYear = HIST[HIST.length - 1][0];
      let A2 = Math.min(h.atAge + (lastYear - h.startYear), L);
      if (h.endAge !== null) A2 = Math.min(A2, h.endAge - 1);
      body =
        A2 < A1 || Y1 > lastYear
          ? `real markets from ${h.startYear}: no real years fall inside the plan`
          : `real markets ${Y1}\u2013${h.startYear + (A2 - h.atAge)} at ages ${A1}\u2013${A2}, then the plan's rates`;
    }
    return `${body}; ${order}`;
  }

  // The ages the scenario changes, [{ fromAge, toAge }] both ends inclusive and capped at the plan's last age, in the text's own
  // arithmetic. A crash is its fall plus its recovery (none when recoverPct is 0), a crash past the last age gives nothing, the
  // windows are not merged; history is the ages the text names (nothing for an empty window); kind 'plan' changes nothing.
  export function marketScenarioWindows(ms, inputs) {
    const ageA = inputs.ageA,
      L = planLastAge(inputs),
      out = [];
    if (ms.kind === 'crash') {
      for (const c of ms.crashes) {
        const A = ageA + Math.max(0, Math.round(c.age - ageA));
        if (A > L) continue;
        out.push({ fromAge: A, toAge: Math.min(L, A + c.fallYears + (c.recoverPct > 0 ? c.recoverYears : 0) - 1) });
      }
    } else if (ms.kind === 'history') {
      const h = ms.history,
        A1 = ageA + Math.max(0, h.atAge - ageA),
        Y1 = h.startYear + (A1 - h.atAge),
        lastYear = HIST[HIST.length - 1][0];
      let A2 = Math.min(h.atAge + (lastYear - h.startYear), L);
      if (h.endAge !== null) A2 = Math.min(A2, h.endAge - 1);
      if (!(A2 < A1 || Y1 > lastYear)) out.push({ fromAge: A1, toAge: A2 });
    }
    return out;
  }
