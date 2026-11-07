// The market-scenario year source: custom crashes or a real-history window laid over the plan's rates

import { pct } from '../format/numbers.js';
import { HIST } from './historical-data.js';

  // Same contract as historicalYearSource, but it has no `startYear`, so runProjection treats the run as non-historical.
  // `inputs.marketScenario` is already normalized (percent units). `taxFactors` is the caller's fresh array.
  // Each year is computed directly from the plan year; the only running state is the inflation factor, which follows
  // the standard pow until the first year whose inflation differs from the plan's, then a running product.
  function crashLevel(c, t) {
    const D = pct(c.drop),
      F = c.fallYears,
      N = c.recoverYears,
      R = pct(c.recoverPct),
      t0 = c.t0;
    if (t < t0) return 1;
    if (t < t0 + F) return Math.pow(1 - D, (t - t0 + 1) / F);
    const qEnd = 1 - D * (1 - R);
    // the last recovery year (and every year after) is qEnd itself, never the pow form's rounded value
    if (t < t0 + F + N - 1) return (1 - D) * Math.pow(qEnd / (1 - D), (t - t0 - F + 1) / N);
    return qEnd;
  }
  function byCrashOrder(a, b) {
    return (
      a.age - b.age || a.drop - b.drop || a.fallYears - b.fallYears || a.recoverPct - b.recoverPct || a.recoverYears - b.recoverYears
    );
  }
  export function scenarioYearSource(inputs, taxFactors) {
    const r = pct(inputs.returnRate),
      planInfl = pct(inputs.inflation),
      planBond = pct(inputs.bondReturn),
      sc = inputs.marketScenario,
      isCrash = sc.kind === 'crash';
    let listed = null,
      sorted = null,
      histT0 = 0;
    if (isCrash) {
      listed = sc.crashes.map((c) => ({ ...c, t0: Math.max(0, Math.round(c.age - inputs.ageA)) }));
      sorted = listed.slice().sort(byCrashOrder);
    } else {
      histT0 = Math.round(sc.history.atAge - inputs.ageA);
    }
    let cumFactor = 1,
      offPlan = false,
      yearInflation = planInfl;
    return {
      inflation: planInfl,
      yearInputs(year) {
        let stock = r,
          infl = planInfl,
          bond = planBond,
          yld = planBond;
        if (isCrash) {
          let qNow = 1,
            qPrev = 1;
          for (let i = 0; i < sorted.length; i++) {
            qNow *= crashLevel(sorted[i], year);
            qPrev *= crashLevel(sorted[i], year - 1);
          }
          if (qNow !== qPrev) stock = ((1 + r) * qNow) / qPrev - 1;
          for (let i = 0; i < listed.length; i++) {
            const c = listed[i];
            if (year >= c.t0 && year < c.t0 + c.fallYears) {
              infl = pct(c.inflation);
              bond = pct(c.bondReturn);
            }
          }
        } else {
          const h = sc.history,
            i = sc.history.startYear - HIST[0][0] + (year - histT0);
          if (year >= histT0 && i >= 0 && i < HIST.length && (h.endAge === null || inputs.ageA + year < h.endAge)) {
            const row = HIST[i];
            stock = row[1] / 100;
            infl = row[2] / 100;
            bond = row[3] / 100;
            yld = row[4] != null ? row[4] / 100 : Math.max(0, bond);
          }
        }
        const factor = offPlan ? cumFactor : Math.pow(1 + planInfl, year);
        if (!offPlan && infl !== planInfl) {
          offPlan = true;
          cumFactor = factor;
        }
        yearInflation = infl;
        taxFactors[year] = factor;
        return { stockReturn: stock, bondReturn: bond, bondYield: yld, factor, limitFactor: factor };
      },
      endOfYear() {
        if (offPlan) cumFactor *= 1 + yearInflation;
      },
    };
  }
