// Test helper: express the old pooled retirement inputs (traditional, roth,
// traditionalSharePctA, rothBasisPct) as the per-partner account fields.
//
// Batch 3A replaced the four pooled fields with four accounts per partner. The
// snapshot grid and the older tests are written in the old vocabulary; this turns a
// patch in that vocabulary into the equivalent new fields, so their numbers can be
// compared to the committed baselines unchanged:
//   - traditional -> the two 401(k)s, split by the old ownership slider (default 50%)
//   - roth        -> the two Roth IRAs, split the same way (the old engine used the
//                    traditional slider for the Roth penalty blend too)
//   - rothBasisPct -> Roth IRA basis dollars (0% becomes $1, because 0 means "not entered, use the
//                    assumed share"); only when the patch names it or opts.pinBasis is set
// A single-person plan puts everything on Partner A (Partner B's accounts are ignored), so a
// single-person patch that names no balances gets the base household's balances moved to A.
// Pure function with no closure state, so snapshot.js can inject it into the page.
function legacyToAccounts(patch, base, opts = {}) {
  const out = { ...patch };
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
  const single = has('singlePerson') ? !!patch.singlePerson : !!(base && base.singlePerson);
  const legacyKeys = ['traditional', 'roth', 'traditionalSharePctA', 'rothBasisPct'].some(has);
  const accountKeys = ['tradIraA', 'trad401kA', 'rothIraA', 'roth401kA', 'rothIraBasisA'].some(has);
  // A single-person patch that names no balances still has to put the household's money on A,
  // because the engine ignores B's accounts in single-person mode.
  if (!legacyKeys && !(single && !accountKeys)) return out;
  const pick = (k, dflt) => (has(k) ? patch[k] : base && base[k] !== undefined ? base[k] : dflt);
  const pctA = single ? 1 : pick('traditionalSharePctA', 50) / 100;
  const baseTotal = (a, b) => (base ? (base[a] || 0) + (base[b] || 0) : 0);
  const trad = has('traditional') ? patch.traditional : baseTotal('trad401kA', 'trad401kB') + baseTotal('tradIraA', 'tradIraB');
  const roth = has('roth') ? patch.roth : baseTotal('rothIraA', 'rothIraB') + baseTotal('roth401kA', 'roth401kB');
  // Legacy default was 100% contributions. `pinBasis` keeps that (tests with hand-computed numbers);
  // without it a patch that names no basis gets the planner's own default (not entered, assumed share).
  const hasBasis = has('rothBasisPct') || opts.pinBasis;
  const basisPct = pick('rothBasisPct', 100);
  const split = (total) => {
    const a = single ? total : total * pctA;
    return [a, single ? 0 : total - a];
  };
  const [tA, tB] = split(trad);
  const [rA, rB] = split(roth);
  const basis = (ira) => (!hasBasis ? 0 : ira > 0 ? (basisPct > 0 ? (ira * basisPct) / 100 : 1) : 0);
  for (const k of ['traditional', 'roth', 'traditionalSharePctA', 'rothBasisPct']) delete out[k];
  Object.assign(out, {
    tradIraA: 0, tradIraB: 0, trad401kA: tA, trad401kB: tB,
    rothIraA: rA, rothIraB: rB, roth401kA: 0, roth401kB: 0,
    rothIraBasisA: basis(rA), rothIraBasisB: basis(rB),
  });
  return out;
}
module.exports = { legacyToAccounts };

// For Playwright tests that set the old pooled ids through the DOM as [id, value] lists.
// US only (Canada keeps traditional/roth as RRSP/TFSA). The list is translated as a whole,
// because the split between partners depends on singlePerson and the ownership slider,
// wherever in the list they appear:
//   traditional -> trad401kA/B (all on A when single, else split by traditionalSharePctA)
//   roth        -> roth401kA/B, with the 401(k) basis slider set from rothBasisPct (default 100),
//                  so a 0% basis is an exact zero (a Roth IRA's basis field cannot say 0).
// Both are numerically what the old pooled fields were: the engine treats the Roth 401(k) as
// the same basis-first ledger until the pro-rata rules of Batch 3B.
function translateFieldList(list, isUS, opts = {}) {
  if (!isUS) return list;
  const last = (id, dflt) => {
    let v = dflt;
    for (const [i, x] of list) if (i === id) v = x;
    return v;
  };
  const single = opts.single !== undefined ? !!opts.single : !!last('singlePerson', false);
  const pctA = last('traditionalSharePctA', 50) / 100;
  const basisPct = last('rothBasisPct', 100);
  const split = (total) => (single ? [total, 0] : [total * pctA, total - total * pctA]);
  const out = [];
  for (const [id, v] of list) {
    if (id === 'traditional') {
      const [a, b] = split(v);
      out.push(['tradIraA', 0], ['tradIraB', 0], ['trad401kA', a], ['trad401kB', b]);
    } else if (id === 'roth') {
      const [a, b] = split(v);
      out.push(['rothIraA', 0], ['rothIraB', 0], ['roth401kA', a], ['roth401kB', b], ['roth401kBasisPctA', basisPct], ['roth401kBasisPctB', basisPct]);
    } else if (id !== 'rothBasisPct' && id !== 'traditionalSharePctA') out.push([id, v]);
  }
  return out;
}
module.exports.translateFieldList = translateFieldList;

// Same translation for tests that set one control at a time. `setInput(page, id, value)` is the
// test's own setter; US pages are recognised by the trad401kA control. `single` says whether the
// plan is single-person (all on A) or a couple (50/50).
async function setBalance(setInput, page, id, value, single = true) {
  const isUS = await page.evaluate(() => !!document.getElementById('trad401kA'));
  if (!isUS) return setInput(page, id, value);
  for (const [i, v] of translateFieldList([[id, value]], true, { single })) await setInput(page, i, v);
}
module.exports.setBalance = setBalance;
