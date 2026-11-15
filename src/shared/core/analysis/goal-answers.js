// The goal answers the engines already give: retirement ages, spending, housing, a death, the estate

import { simulateWith } from '../projection/runs.js';
import { MOVE_RULES, retireShift, retireShiftRange, firstTrueSteps } from './moves.js';
import { projectionWordSteps } from './projection-verdict.js';
import { spendingRoomSteps } from './spending-room.js';

  // The retirement ages the plan lasts from and is Comfortable from, as shifts k of both partners' ages (retireShiftRange), by
  // the projection word; and the room each year of earlier retirement costs (a room found at k = -1, room-judged plans only).
  // `baseVerdict` is the plan's projection verdict (it seeds k = 0). Each boundary is a bisection; the words found by the first
  // scan are reused by the second.
  export function* retireAnswerSteps(base, contextFor, baseVerdict) {
    const { lo, hi } = retireShiftRange(base);
    if (lo > hi) return { lastsFrom: null, comfortableFrom: null, perYear: null, lo, hi, empty: true };
    const words = new Map([[0, baseVerdict.word]]);
    const wordAt = function* (k) {
      if (!words.has(k)) words.set(k, (yield* projectionWordSteps({ ...base, ...retireShift(base, k) }, contextFor)).word);
      return words.get(k);
    };
    const seed = (pass) => {
      const known = new Map();
      for (const [k, w] of words) known.set(k, pass(w));
      return known;
    };
    const lastsFrom = yield* firstTrueSteps(lo, hi, seed((w) => w !== 'short'), function* (k) {
      return (yield* wordAt(k)) !== 'short';
    });
    const comfortableFrom = yield* firstTrueSteps(lo, hi, seed((w) => w === 'comfortable'), function* (k) {
      return (yield* wordAt(k)) === 'comfortable';
    });
    let perYear = null;
    if (lo <= -1 && !baseVerdict.guardrails && !baseVerdict.atCap && !baseVerdict.unfixable) {
      const earlier = { ...base, ...retireShift(base, -1) };
      const selected = simulateWith(contextFor(earlier));
      yield 'run';
      const f = yield* spendingRoomSteps(selected, earlier, contextFor);
      if (!f.atCap && !f.unfixable) perYear = baseVerdict.room - f.room;
    }
    return { lastsFrom, comfortableFrom, perYear, lo, hi, empty: false };
  }

  // The room of `variant` minus `baseRoom`: one run of the variant (the selected run the search needs), then the room search.
  export function* roomChangeSteps(base, variant, contextFor, baseRoom) {
    const selected = simulateWith(contextFor(variant));
    yield 'run';
    const f = yield* spendingRoomSteps(selected, variant, contextFor);
    return f.room - baseRoom;
  }

  // The housing changes worth measuring against the plan's own tenure: { key, patch }.
  export function houseVariants(base) {
    if (base.tenure === 'own') {
      const out = [{ key: 'rent', patch: { tenure: 'rent' } }];
      if (base.mortgage > 0) out.push({ key: 'payoff', patch: { extraPrincipal: base.extraPrincipal > 0 ? 0 : 500 } });
      return out;
    }
    if (base.tenure === 'rent') return [{ key: 'own', patch: { tenure: 'own' } }];
    if (base.tenure === 'rentThenBuy') return [{ key: 'rent', patch: { tenure: 'rent' } }];
    return [];
  }

  // The survivor cases of a couple: Partner A dying, then Partner B; none for a single person.
  export function survivorVariants(base) {
    if (base.singlePerson) return [];
    return ['A', 'B'].map((partner) => ({ partner, patch: { survivorEnabled: true, survivorPartner: partner } }));
  }
