// The moves the dashboard tests on a Tight or Short plan: their inputs, their outcome and their order

import { displayRoom, VERDICT_RULES } from './spending-room.js';
import { projectionWordSteps } from './projection-verdict.js';

  // load-time: an object literal of numbers, frozen; reads nothing.
  // maxShown: moves listed at most; maxDelay: the latest retirement shift scanned (years); fallbackDelay: the shift a
  // retire-later move offers when no shift in range fixes the plan; minGain: the smallest shown room gain worth listing;
  // maxRetireAge: the retirement-age sliders' max (timelineGroupState.html) and clampRetireAgeA's cap (inputs/clamps.js).
  export const MOVE_RULES = Object.freeze({ maxShown: 4, maxDelay: 15, fallbackDelay: 5, minGain: 500, maxRetireAge: 70 });

  // Whether each partner is still working (retireAge > age): only they are moved by a retirement shift. normalizeState
  // sets a retired partner's retireAge to their age, and a single person's Partner B never counts.
  export function workingPartners(base) {
    return { A: base.retireAgeA > base.ageA, B: !base.singlePerson && base.retireAgeB > base.ageB };
  }

  // The retirement ages of `base` moved by k years: each partner still working moves, an already-retired partner (and a
  // single person's Partner B) keeps theirs.
  export function retireShift(base, k) {
    const w = workingPartners(base);
    return { retireAgeA: w.A ? base.retireAgeA + k : base.retireAgeA, retireAgeB: w.B ? base.retireAgeB + k : base.retireAgeB };
  }

  // The shifts the retirement scans may use, from the partners still working: never earlier than today's age (nor more than
  // 10 years earlier), never later than maxDelay years, the age-70 cap or the year before the plan ends. Empty (hi < lo)
  // when no partner is still working.
  export function retireShiftRange(base) {
    const w = workingPartners(base);
    if (!w.A && !w.B) return { lo: 0, hi: -1 };
    let lo = -10,
      hi = MOVE_RULES.maxDelay;
    if (w.A) {
      lo = Math.max(lo, base.ageA - base.retireAgeA);
      hi = Math.min(hi, MOVE_RULES.maxRetireAge - base.retireAgeA, base.lifeExpectancyA - 1 - base.retireAgeA);
    }
    if (w.B) {
      lo = Math.max(lo, base.ageB - base.retireAgeB);
      hi = Math.min(hi, MOVE_RULES.maxRetireAge - base.retireAgeB, base.lifeExpectancyB - 1 - base.retireAgeB);
    }
    return { lo, hi };
  }

  // The smallest k in [lo, hi] with test(k) true, or null when test(hi) is false; `test` is a generator function returning a
  // boolean and assumed monotone in k. `known` (a Map of shift -> boolean already decided) narrows the bounds first and gets
  // every shift tested here, so a caller can share it between scans. Bisects between the sentinels lo - 1 (false) and
  // hi + 1 (true, meaning none).
  export function* firstTrueSteps(lo, hi, known, test) {
    let f = lo - 1,
      t = hi + 1;
    for (const [k, ok] of known) {
      if (k < lo || k > hi) continue;
      if (ok) t = Math.min(t, k);
      else f = Math.max(f, k);
    }
    while (t - f > 1) {
      const m = Math.floor((f + t) / 2);
      let ok;
      if (known.has(m)) ok = known.get(m);
      else {
        ok = yield* test(m);
        known.set(m, ok);
      }
      if (ok) t = m;
      else f = m;
    }
    return t <= hi ? t : null;
  }

  // The retire-later move: the smallest delay k >= 1 that fixes the plan (Short: no longer short; Tight: Comfortable), judged
  // by the projection word under the caller's `contextFor`; with none in range, the fallback delay, not fixed. null when the
  // plan is already Comfortable or no later age is allowed (no partner still working, or a cap).
  export function* retireLaterSteps(base, contextFor, baseWord) {
    if (baseWord === 'comfortable') return null;
    const { hi } = retireShiftRange(base);
    if (hi < 1) return null;
    const fix = function* (k) {
      const { word } = yield* projectionWordSteps({ ...base, ...retireShift(base, k) }, contextFor);
      return baseWord === 'short' ? word !== 'short' : word === 'comfortable';
    };
    const k = yield* firstTrueSteps(1, hi, new Map(), fix);
    return k === null ? { k: Math.min(MOVE_RULES.fallbackDelay, hi), fixed: false } : { k, fixed: true };
  }

  // The change to base spending (negative) the cut-spending move applies: a Short plan's own shown cut; for a Tight plan the
  // smallest multiple of 500 whose cut makes the shown room reach the Comfortable share of the reduced spending. null under
  // guardrails (the margin is the cut, not the room) or when no cut fixes the plan.
  export function cutSpendingDelta(baseVerdict) {
    if (baseVerdict.guardrails || baseVerdict.unfixable) return null;
    if (baseVerdict.word === 'short') return baseVerdict.shown;
    let c = 500;
    while (displayRoom(baseVerdict.room + c) < VERDICT_RULES.minRoomShare * (baseVerdict.shareBase - c) && c < baseVerdict.shareBase) c += 500;
    return -c;
  }

  // Whether a move fixes the plan (Short: no longer short; Tight: Comfortable) and what it gains: the room difference when both
  // verdicts are room-based, the guardrail cut's drop in points when both are guardrail-judged, otherwise 0.
  export function moveOutcome(baseVerdict, moveVerdict) {
    const fixes = baseVerdict.word === 'short' ? moveVerdict.word !== 'short' : moveVerdict.word === 'comfortable';
    let gain = 0;
    if (!baseVerdict.guardrails && !moveVerdict.guardrails) gain = moveVerdict.room - baseVerdict.room;
    else if (baseVerdict.guardrails && moveVerdict.guardrails) gain = baseVerdict.cutPct - moveVerdict.cutPct;
    return { fixes, gain };
  }

  // The moves worth listing, in order: the fixing moves first (best verdict first: room descending, or cut ascending when
  // guardrail-judged, room-judged before guardrail-judged; the guardrails move last among them), then the rest by gain
  // descending; a non-fixing move is kept only when its shown gain counts (a room gain of minGain, a cut gain of 1 point), the
  // guardrails move only when it fixes. Ties keep the input order; at most maxShown. Each move is
  // { key, label, patch, verdict, fixes, gain }; the input array is not changed.
  export function rankMoves(moves) {
    const counts = (m) => (m.verdict.guardrails ? m.gain >= 1 : displayRoom(m.gain) >= MOVE_RULES.minGain);
    const kept = moves.filter((m) => m.fixes || (m.key !== 'guardrails' && counts(m)));
    const fixing = kept.filter((m) => m.fixes),
      rest = kept.filter((m) => !m.fixes);
    fixing.sort((a, b) => {
      const ga = a.key === 'guardrails',
        gb = b.key === 'guardrails';
      if (ga !== gb) return ga ? 1 : -1;
      if (a.verdict.guardrails !== b.verdict.guardrails) return a.verdict.guardrails ? 1 : -1;
      return a.verdict.guardrails ? a.verdict.cutPct - b.verdict.cutPct : b.verdict.room - a.verdict.room;
    });
    rest.sort((a, b) => b.gain - a.gain);
    return fixing.concat(rest).slice(0, MOVE_RULES.maxShown);
  }
