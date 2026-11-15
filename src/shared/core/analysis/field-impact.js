// How far a realistic error in one field moves the spending room (the guidance list's figure)

import { displayValueOf } from '../format/display-value.js';
import { simulateWith } from '../projection/runs.js';
import { findSpendingRoom, spendingVariant } from './spending-room.js';

  // load-time: an object literal of numbers, frozen; reads nothing
  export const IMPACT_RULES = Object.freeze({ moneyPct: 10, ageYears: 2, ratePts: 1, sharePts: 10, slopeStep: 1000, minShown: 500, criticalRank: 2000 });

  // The inputs with field `id` nudged one realistic step (dir is 1 or -1), or null when the clamped value equals the base value.
  // The linked age keys follow as normalizeState has them. Never writes base.
  export function nudgedInputs(base, id, kind, dir, bounds) {
    const v = base[id];
    let x;
    if (kind === 'money') x = v + (v * IMPACT_RULES.moneyPct * dir) / 100;
    else if (kind === 'age') x = v + IMPACT_RULES.ageYears * dir;
    else if (kind === 'rate') x = Math.max(0, v + IMPACT_RULES.ratePts * dir);
    else x = Math.min(100, Math.max(0, v + IMPACT_RULES.sharePts * dir));
    if (bounds) x = Math.min(bounds[1], Math.max(bounds[0], x));
    const who = id.slice(-1);
    const person = who === 'A' || who === 'B';
    const stem = person ? id.slice(0, -1) : '';
    if (stem === 'retireAge') x = Math.min(base['lifeExpectancy' + who], Math.max(base['age' + who], x));
    if (stem === 'lifeExpectancy') x = Math.min(110, Math.max(base['age' + who] + 1, x));
    if (x === v) return null;
    const out = { ...base, [id]: x };
    if (stem === 'age') {
      out['retireAge' + who] = Math.max(base['retireAge' + who], x);
      out['lifeExpectancy' + who] = Math.max(base['lifeExpectancy' + who], x + 1);
    }
    return out;
  }

  // The run's end-of-plan position in today's dollars: the final total minus every year's shortfall (what no account covered).
  export function endMeasure(sim, inputs) {
    const real = (x, r) => displayValueOf('real', inputs.inflation, x, r.year, r.cumFactor);
    const last = sim.rows[sim.rows.length - 1];
    let short = 0;
    for (const r of sim.rows) short += real(r.shortfall, r);
    return real(last.total, last) - short;
  }

  // The measure is the end position (final total minus the real sum of shortfalls), not `investable`. It is unfloored because the
  // shortfall keeps counting past depletion, so it stays linear across the edge. `investable` would read 0 at the edge, because the
  // plan draws the home last. d0 is the room, the cap or the unfixable floor; slope is the measure's change per dollar of spending a
  // year there. Null unless the slope is positive. runs counts every projection, the search's included.
  export function impactSetup(base, contextFor) {
    const found = findSpendingRoom(simulateWith(contextFor(base)), base, contextFor);
    const d0 = found.room;
    let runs = found.runs + 1;
    const at = (d) => {
      runs++;
      const v = spendingVariant(base, d);
      return endMeasure(simulateWith(contextFor(v)), v);
    };
    const m0 = at(d0);
    const slope = (m0 - at(d0 + IMPACT_RULES.slopeStep)) / IMPACT_RULES.slopeStep;
    if (!(slope > 0)) return null;
    return { d0, m0, slope, runs };
  }

  // The larger, over the two directions, of how far the nudge moves the measure at the edge, divided by the slope (dollars of
  // spending a year). An approximation: the slope is the base one. Never negative.
  export function fieldImpact(base, id, kind, bounds, setup, contextFor) {
    let best = 0;
    for (const dir of [1, -1]) {
      const v = nudgedInputs(base, id, kind, dir, bounds);
      if (v === null) continue;
      const w = spendingVariant(v, setup.d0);
      best = Math.max(best, Math.abs(endMeasure(simulateWith(contextFor(w)), w) - setup.m0) / setup.slope);
    }
    return best;
  }

  export function shownImpact(x) {
    return x < IMPACT_RULES.minShown ? 0 : Math.round(x / 100) * 100;
  }
