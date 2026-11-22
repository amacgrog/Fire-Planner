// The claiming search's ranking (SS claiming optimizer PR 5): a strict win and the winner of a list, shared by the search and the card's text

// The ranking (spec 6): a strict win of measure `c` over `best`. A choice that never runs out beats one that does; between two
// that never run out, the after-tax end value higher by more than the cliff plan's $1; between two that run out, the later age.
export function claimBetter(c, best) {
  if (c.depletedAge === null) return best.depletedAge !== null || c.value > best.value + 1;
  if (best.depletedAge === null) return false;
  return c.depletedAge > best.depletedAge;
}
// The index of the winner of `list` (measures) scanned in order: only a strict win replaces the best, so the first entry wins
// every tie (the callers put the current choice first, then the earlier ages).
export function claimPick(list) {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (claimBetter(list[i], list[best])) best = i;
  return best;
}
