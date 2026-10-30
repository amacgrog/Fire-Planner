// US flat-bracket card's pick of a Roth conversion bracket

import { pickBest } from '../../../shared/core/analysis/objectives.js';
import { notWorseThan } from './objectives.js';

  // The flat-bracket card's pick. results: [{ bracket, depletedAge, score }] (score: the after-tax end value, nominal).
  // The brackets that pass the guardrail against the current plan (all of them when none passes), then pickBest: the latest
  // depletion, the highest score with a $1 tie; among the tied, the current bracket, else the lowest bracket.
  export function pickFlatBracket(results, selectedDepletedAge, currentBracket) {
    const pool = results.filter((r) => notWorseThan(selectedDepletedAge, r.depletedAge));
    return pickBest(pool.length ? pool : results, (tied) =>
      tied.find((r) => r.bracket === currentBracket) || tied.reduce((a, b) => (b.bracket < a.bracket ? b : a)),
    );
  }
