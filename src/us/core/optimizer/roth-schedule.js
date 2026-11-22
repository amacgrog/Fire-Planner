// US flat-bracket card's pick of a Roth conversion bracket, or of no conversions

import { pickBest } from '../../../shared/core/analysis/objectives.js';
import { notWorseThan } from './objectives.js';

  // The flat-bracket card's pick. results: [{ bracket, depletedAge, score }] (score: the after-tax end value, nominal); the
  // "No conversions" row has bracket null.
  // The rows that pass the guardrail against the current plan (all of them when none passes), then pickBest: the latest
  // depletion, the highest score with a $1 tie; among the tied, the current bracket, else the lowest converting bracket, and
  // the "No conversions" row only when it is the one tied row (so it is picked only when it beats every bracket in the pool).
  export function pickFlatBracket(results, selectedDepletedAge, currentBracket) {
    const pool = results.filter((r) => notWorseThan(selectedDepletedAge, r.depletedAge));
    return pickBest(pool.length ? pool : results, (tied) => {
      const brackets = tied.filter((r) => r.bracket != null);
      if (!brackets.length) return tied[0];
      return brackets.find((r) => r.bracket === currentBracket) || brackets.reduce((a, b) => (b.bracket < a.bracket ? b : a));
    });
  }
