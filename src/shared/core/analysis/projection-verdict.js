// The verdict of a projection without history: its word, its room or guardrail cut, and its cheap word-only check

import { simulateWith } from '../projection/runs.js';
import {
  comfortableThreshold, deepestGuardrailCut, displayRoom, drainSteps, planVerdict, retiredSpending, spendingRoomSteps,
  spendingVariant,
} from './spending-room.js';

  // The verdict of `base` read as the projection alone (no historical rate, no scenario). `selected` is the run of `base` when
  // the caller has it; otherwise it is run here. Yields 'run' after every projection; returns the verdict fields and the run count.
  export function* projectionVerdictSteps(base, contextFor, selected = null) {
    let runs = 0;
    if (selected === null) {
      selected = simulateWith(contextFor(base));
      runs++;
      yield 'run';
    }
    const guardrails = Boolean(base.guardrailsEnabled && !selected.depletedAge);
    let found = { room: 0, atCap: false, unfixable: false },
      cutPct = 0;
    if (guardrails) {
      const off = simulateWith(contextFor({ ...base, guardrailsEnabled: false }));
      runs++;
      yield 'run';
      cutPct = Math.round(deepestGuardrailCut(selected, off) * 100);
    } else {
      const f = yield* spendingRoomSteps(selected, base, contextFor);
      runs += f.runs;
      found = f;
    }
    const shown = displayRoom(found.room),
      shareBase = retiredSpending(selected, base);
    const depletedAge = selected.depletedAge || null;
    const word = planVerdict({
      depleted: Boolean(selected.depletedAge),
      roomShare: shareBase > 0 ? shown / shareBase : Infinity,
      histRate: null,
      guardrails,
      cutPct,
      scenario: false,
    });
    return { word, room: found.room, shown, atCap: found.atCap, unfixable: found.unfixable, guardrails, cutPct, depletedAge,
      shareBase, selected, runs };
  }

  export function projectionVerdict(base, contextFor, selected = null) {
    return drainSteps(projectionVerdictSteps(base, contextFor, selected));
  }

  // The same word in at most two runs: one at base, then one more (the guardrails-off run, or one at the Comfortable threshold).
  export function* projectionWordSteps(base, contextFor) {
    let runs = 0;
    const selected = simulateWith(contextFor(base));
    runs++;
    yield 'run';
    const depletedAge = selected.depletedAge || null;
    const shareBase = retiredSpending(selected, base);
    if (depletedAge) return { word: 'short', depletedAge, shareBase, runs };
    if (base.guardrailsEnabled) {
      const off = simulateWith(contextFor({ ...base, guardrailsEnabled: false }));
      runs++;
      yield 'run';
      const cutPct = Math.round(deepestGuardrailCut(selected, off) * 100);
      const word = planVerdict({ depleted: false, roomShare: 0, histRate: null, guardrails: true, cutPct, scenario: false });
      return { word, depletedAge, shareBase, runs };
    }
    if (!(shareBase > 0)) return { word: 'comfortable', depletedAge, shareBase, runs };
    // Assumes the threshold is under the room search's cap (true unless 10% of retired spending exceeds max(100000, 2 * spending)).
    const lasts = !simulateWith(contextFor(spendingVariant(base, comfortableThreshold(shareBase)))).depletedAge;
    runs++;
    yield 'run';
    return { word: lasts ? 'comfortable' : 'tight', depletedAge, shareBase, runs };
  }

  export function projectionWord(base, contextFor) {
    return drainSteps(projectionWordSteps(base, contextFor));
  }
