// Spending room: how much more (or less) a year the plan supports, and the verdict word

import { displayValueOf } from '../format/display-value.js';
import { simulateWith } from '../projection/runs.js';

  export const ROOM_STEP = 100;
  // load-time: an object literal of numbers, frozen; reads nothing
  export const VERDICT_RULES = Object.freeze({ minRoomShare: 0.10, minHistSuccess: 0.80, maxGuardrailCutPct: 10 });

  // The inputs with every spending level (base and each tier) moved by delta a year, never below zero.
  // The same-delta shift is exact only for tiers that follow inflation: a tier with followGrowth: false (its own growth) gets the
  // delta in its own dollars, so the room is approximate for it.
  export function spendingVariant(base, delta) {
    return {
      ...base,
      spending: Math.max(0, base.spending + delta),
      spendingTiers: base.spendingTiers.map((t) => ({ ...t, amount: Math.max(0, t.amount + delta) })),
    };
  }

  // The largest multiple of ROOM_STEP a year the plan can add to (room > 0) or must cut from (room < 0) its spending and still
  // last. `selected` is the run on the base inputs; `contextFor` builds a run context from a variant's inputs.
  // Lasting is assumed monotone in delta (more spending never lasts when less does not).
  export function* spendingRoomSteps(selected, base, contextFor) {
    let runs = 0;
    const lasts = function* (d) {
      runs++;
      const ok = !simulateWith(contextFor(spendingVariant(base, d))).depletedAge;
      yield 'run';
      return ok;
    };
    // The largest k in [loK, hiK) with lasts(k * ROOM_STEP), given that loK lasts and hiK does not.
    const bisect = function* (loK, hiK) {
      while (hiK - loK > 1) {
        const mid = Math.floor((loK + hiK) / 2);
        if (yield* lasts(mid * ROOM_STEP)) loK = mid;
        else hiK = mid;
      }
      return loK;
    };
    if (!selected.depletedAge) {
      const cap = ROOM_STEP * Math.ceil(Math.max(100000, 2 * base.spending) / ROOM_STEP);
      if (yield* lasts(cap)) return { room: cap, atCap: true, unfixable: false, runs };
      return { room: (yield* bisect(0, cap / ROOM_STEP)) * ROOM_STEP, atCap: false, unfixable: false, runs };
    }
    const lo = -ROOM_STEP * Math.ceil(Math.max(base.spending, ...base.spendingTiers.map((t) => t.amount)) / ROOM_STEP);
    if (!(yield* lasts(lo))) return { room: lo, atCap: false, unfixable: true, runs };
    return { room: (yield* bisect(lo / ROOM_STEP, 0)) * ROOM_STEP, atCap: false, unfixable: false, runs };
  }

  // Runs a generator to its end and returns its return value.
  export function drainSteps(gen) {
    for (;;) {
      const r = gen.next();
      if (r.done) return r.value;
    }
  }

  export function findSpendingRoom(selected, base, contextFor) {
    return drainSteps(spendingRoomSteps(selected, base, contextFor));
  }

  // The room as shown: rounded toward the cautious side (down for room to spare, up for a cut needed), never -0.
  export function displayRoom(x) {
    const step = Math.abs(x) < 5000 ? 500 : 1000;
    const r = x >= 0 ? Math.floor(x / step) * step : -Math.max(500, Math.ceil(-x / step) * step);
    return r === 0 ? 0 : r;
  }

  // The deepest cut, as a share of the off run's spending, the guardrails make in a retired year (0 when none).
  export function deepestGuardrailCut(onSim, offSim) {
    let ratio = Infinity;
    for (let i = 0; i < onSim.rows.length; i++) {
      if (onSim.rows[i].working || !(offSim.rows[i].baseSpend > 0)) continue;
      ratio = Math.min(ratio, onSim.rows[i].baseSpend / offSim.rows[i].baseSpend);
    }
    return ratio === Infinity ? 0 : Math.max(0, 1 - ratio);
  }

  // The household's average spending over its retired years, in today's dollars: base spending, or the spending tier that
  // replaces it in a year (the guardrail and survivor factors as the run applied them). The verdict's room share is measured
  // against it, so a tier that changes retirement spending changes the share (0 when no year is retired).
  export function retiredSpending(sim, inputs) {
    let total = 0,
      years = 0;
    for (const r of sim.rows) {
      if (r.working) continue;
      total += displayValueOf('real', inputs.inflation, r.baseSpend, r.year, r.cumFactor);
      years++;
    }
    return years ? total / years : 0;
  }

  // Whether the margin alone (spending room, or with guardrails the deepest cut) reads Comfortable.
  function marginOk({ roomShare, guardrails, cutPct }) {
    return guardrails ? cutPct <= VERDICT_RULES.maxGuardrailCutPct : roomShare >= VERDICT_RULES.minRoomShare;
  }

  export function planVerdict({ depleted, roomShare, histRate, guardrails, cutPct, scenario }) {
    if (depleted) return 'short';
    const histOk = scenario || histRate == null || histRate >= VERDICT_RULES.minHistSuccess;
    return histOk && marginOk({ roomShare, guardrails, cutPct }) ? 'comfortable' : 'tight';
  }

  // Whether the historical success rate alone set the word (feedback B4): the plan lasts, its margin reads Comfortable, and the
  // backtest (landed, and not ignored for a market scenario) is under the line. Only then does the verdict say history made it Tight.
  export function historySetsWord({ depleted, roomShare, histRate, guardrails, cutPct, scenario }) {
    return !depleted && !scenario && histRate != null && histRate < VERDICT_RULES.minHistSuccess &&
      marginOk({ roomShare, guardrails, cutPct });
  }

  // The smallest multiple of ROOM_STEP whose shown room reads Comfortable for a retired-spending base, by the verdict's own
  // comparison (shareBase can be fractional, so the comparison decides, not minRoomShare * shareBase).
  export function comfortableThreshold(shareBase) {
    if (!(shareBase > 0)) return 0;
    const reads = (t) => displayRoom(t) / shareBase >= VERDICT_RULES.minRoomShare;
    const X = VERDICT_RULES.minRoomShare * shareBase;
    const unit = Math.ceil(X / 500) * 500 >= 5000 ? 1000 : 500;
    let t = Math.max(0, Math.ceil(X / unit) * unit);
    while (t >= ROOM_STEP && reads(t - ROOM_STEP)) t -= ROOM_STEP;
    while (!reads(t)) t += ROOM_STEP;
    return t;
  }
