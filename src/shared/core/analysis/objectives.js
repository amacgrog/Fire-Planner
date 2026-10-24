// The objective registry's ranking: depletion first, then the score with a $1 tolerance

  // A null depletedAge (never depletes) counts as Infinity, as planCandidateBetter does.
  function depletion(x) {
    return x.depletedAge == null ? Infinity : x.depletedAge;
  }
  // True when a strictly beats b: the later depletion wins; at equal depletion the higher score wins only by more than $1.
  export function objectiveBetter(a, b) {
    const da = depletion(a),
      db = depletion(b);
    if (da !== db) return da > db;
    return a.score > b.score + 1;
  }
  // The best of a non-empty list: keep the latest-depletion group, find its top score, and hand the candidates within $1
  // of that top score (in input order) to preferred(tied), which returns the one to use.
  export function pickBest(cands, preferred) {
    let latest = -Infinity;
    for (const c of cands) if (depletion(c) > latest) latest = depletion(c);
    let top = -Infinity;
    for (const c of cands) if (depletion(c) === latest && c.score > top) top = c.score;
    const tied = cands.filter((c) => depletion(c) === latest && !(top > c.score + 1));
    return preferred(tied);
  }
