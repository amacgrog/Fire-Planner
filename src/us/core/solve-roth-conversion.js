import { state } from '../../shared/core/store.js';
import { optimizerState } from './optimizer-state.js';
import { solveRothConversionTo } from './withdrawals/roth-conversion.js';

  // Per-year bracket override for the multi-lever optimizer
  // (optimizeRothLadderPerYear() below) — null in normal operation, so
  // every existing call site keeps using the flat state.rothConvBracket
  // exactly as before. When the optimizer is evaluating a candidate
  // schedule, it sets this to a Map<Partner-A age, bracket-pct-or-0> for
  // the duration of one simulate() call, then restores it to null — same
  // mutate/simulate/restore idiom SENSITIVITY_LEVERS and
  // computeRothOptimizer() already use. A mapped value of 0 is a
  // distinct sentinel meaning "convert nothing this year" (not a real
  // bracket — bracketCeilingReal(0,...) would otherwise fall through to
  // its "not found" branch and return the top bracket, the opposite of
  // what 0 is supposed to mean), so it's checked before bracketCeilingReal
  // is ever called.
  export function solveRothConversion(profile, maxAvailable, yearIndex, ageKey) {
    if (maxAvailable <= 0) return 0;
    // Transient optimizer-search override takes priority (set only for the
    // duration of one simulate() call, see above); next, a schedule
    // previously written by the optimizer's "Apply this schedule" button
    // (state.appliedRothSchedule, see defaults/normalizeState) — both are
    // keyed by Partner A's age, so both engines (simulate() and
    // simulateHistorical()) pass the age. Falls through to the flat bracket.
    const bracketPct =
      optimizerState.rothBracketByAge && optimizerState.rothBracketByAge.has(ageKey)
        ? optimizerState.rothBracketByAge.get(ageKey)
        : state.appliedRothSchedule && Object.prototype.hasOwnProperty.call(state.appliedRothSchedule, ageKey)
          ? state.appliedRothSchedule[ageKey]
          : state.rothConvBracket;
    return solveRothConversionTo(profile, maxAvailable, yearIndex, bracketPct);
  }
