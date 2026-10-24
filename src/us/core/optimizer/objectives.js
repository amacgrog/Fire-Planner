// The US objective registry: the after-tax end value and lifetime tax + healthcare, their breakdown and gain

import { pct } from '../../../shared/core/format/numbers.js';
import { afterTaxEndValueUS, endTaxUS } from '../cliff-plan/solver.js';
import { rowCost, rowTax } from '../projection/row-cost.js';

// The registry scores standard (deterministic) runs only: a historical row's real value divides by its cumFactor, not the
// inflation input, and Monte Carlo rates are reported, never used to choose (spec section 3).
// endValue is the nominal after-tax end value (ranked with the cliff plan's $1 tolerance); lifetimeCost is the real
// (today's dollars, undiscounted) sum of tax + healthcare. score is higher-is-better for both.
export const US_OBJECTIVES = {
  endValue: {
    id: 'endValue',
    label: 'After-tax end value',
    sense: 'max',
    value: (ctx, sim) => afterTaxEndValueUS(ctx, sim),
    score: (ctx, sim) => afterTaxEndValueUS(ctx, sim),
  },
  lifetimeCost: {
    id: 'lifetimeCost',
    label: 'Lifetime tax + healthcare',
    sense: 'min',
    value: (ctx, sim) => realCost(ctx, sim),
    score: (ctx, sim) => -realCost(ctx, sim),
  },
};

export const DEFAULT_OBJECTIVE_ID = 'endValue';

export function objectiveById(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(US_OBJECTIVES, id)) throw new Error('unknown objective: ' + id);
  return US_OBJECTIVES[id];
}

// The same expression and order as computeCliffPlan's measure: one deflated term per row, added from 0.
function realCost(ctx, sim) {
  const infl = pct(ctx.inputs.inflation);
  return sim.rows.reduce((s, r) => s + rowCost(r) / Math.pow(1 + infl, r.year), 0);
}

// The breakdown, in today's dollars: each row sum deflated per row; the end figures at the last row's year.
export function objectiveBreakdown(ctx, sim) {
  const infl = pct(ctx.inputs.inflation);
  const rows = sim.rows;
  let lifetimeTax = 0, healthcare = 0, rmds = 0;
  for (const r of rows) {
    const f = Math.pow(1 + infl, r.year);
    lifetimeTax += rowTax(r) / f;
    healthcare += (r.taxSettled !== undefined ? r.healthcareSettled : r.healthcare) / f;
    rmds += r.rmd / f;
  }
  const lastF = rows.length ? Math.pow(1 + infl, rows[rows.length - 1].year) : 1;
  return {
    lifetimeCost: realCost(ctx, sim),
    lifetimeTax,
    healthcare,
    rmds,
    endTax: endTaxUS(ctx, sim) / lastF,
    endValue: afterTaxEndValueUS(ctx, sim) / lastF,
    depletedAge: sim.depletedAge,
  };
}

// How much better the winner is than the base, in today's dollars (spec section 4). One context prices both runs.
export function gainInTodaysDollars(objective, ctx, winnerSim, baseSim) {
  if (objective.sense === 'max') {
    const rows = winnerSim.rows;
    const f = Math.pow(1 + pct(ctx.inputs.inflation), rows[rows.length - 1].year);
    return (objective.value(ctx, winnerSim) - objective.value(ctx, baseSim)) / f;
  }
  return objective.value(ctx, baseSim) - objective.value(ctx, winnerSim);
}

// The optimizer cards' gate (today's dollars): a gain of more than $1 is a suggestion worth applying.
export function applyGateOpen(gain) {
  return gain > 1;
}
