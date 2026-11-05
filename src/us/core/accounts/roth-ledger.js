// US Roth account ledger: contributions, conversions, seasoning and slot splits

import { openingRothBasisSlots } from './account-ledger.js';

  // Roth early-access rules, one ledger per Roth account, in ACCOUNT_SLOTS order (Roth IRA A,
  // Roth 401(k) A, Roth IRA B, Roth 401(k) B). Roth IRA (IRC 408A(d)(4), Treas. Reg. 1.408A-6
  // Q&A-8): `basis` is contributions plus conversions already seasoned for 5 years (always
  // withdrawable with no tax or penalty), `conv` the conversions still inside their own 5-year
  // window (oldest first: no tax but the 10% penalty if taken before 59.5), and earnings are
  // the rest (ordinary income plus the 10% penalty before 59.5). Draws come out in that order.
  // A conversion in year y is seasoned from year y + 5. Roth 401(k) (Treas. Reg. 1.402A-1
  // Q&A-3): non-qualified draws are pro rata, so a draw's earnings fraction is
  // 1 - basis/balance; `basis` is the contributions, never seasoned, `conv` stays empty.
  // The ledgers hold dollars of basis; account balances are share x pool (see below), so
  // earnings are whatever the balance has grown beyond the basis.
  export function rothAccountsNew(inputs) {
    return openingRothBasisSlots(inputs).map((basis) => ({ basis, conv: [] }));
  }
  export function rothAccountsSeason(R, year) {
    for (const L of R) while (L.conv.length && L.conv[0].year + 5 <= year) L.basis += L.conv.shift().amount;
  }
  // Snapshot/restore for the per-year MAGI iteration (see MAGI_ITER_MAX).
  export function rothAccountsClone(R) {
    return R.map((L) => ({ basis: L.basis, conv: L.conv.map((c) => ({ ...c })) }));
  }
  export function rothAccountsRestore(R, snap) {
    for (let i = 0; i < R.length; i++) {
      R[i].basis = snap[i].basis;
      R[i].conv = snap[i].conv.map((c) => ({ ...c }));
    }
  }
  // `amounts` (one per slot) are new contributions: they add to that account's basis.
  export function rothAccountsContribute(R, amounts) {
    for (let i = 0; i < R.length; i++) R[i].basis += amounts[i];
  }
  // A conversion lands in the converting partner's Roth IRA ([toA, toB] from accountsConvert). PR 2 (IRA basis): with `free`
  // ([A, B], the tax-free part of each partner's conversion) `to` is the taxable part, and each partner gets two entries, the
  // taxable one first and then the tax-free one (`free: true`), the order Treas. Reg. 1.408A-6 Q&A-8 draws them in. An entry's
  // 10% recapture falls only on taxable dollars (408A(d)(3)(F)): a free entry is never penalized. An entry without the flag is a
  // taxable one; `free` null pushes the old single entry.
  export function rothAccountsConvert(R, to, year, free = null) {
    if (free === null) {
      if (to[0] > 0) R[0].conv.push({ year, amount: to[0] });
      if (to[1] > 0) R[2].conv.push({ year, amount: to[1] });
      return;
    }
    for (let p = 0; p < 2; p++) {
      if (to[p] > 0) R[2 * p].conv.push({ year, amount: to[p], free: false });
      if (free[p] > 0) R[2 * p].conv.push({ year, amount: free[p], free: true });
    }
  }
  // How a gross draw `x` from Roth account `i` (balance `dollars`) splits across its ledger,
  // and what that costs given the owner's status ({free, qualified}, see penaltyStatus):
  // `earn` is the part that is ordinary income, `penaltyBase` the part the 10% applies to.
  export function rothSlotSplit(L, i, dollars, x, st) {
    let fromBasis,
      fromConv = 0,
      convPenalized = 0,
      fromEarn;
    if (i % 2 === 1) {
      const eps = dollars > 0 ? Math.max(0, 1 - Math.min(Math.max(0, L.basis), dollars) / dollars) : 0;
      fromEarn = x * eps;
      fromBasis = x - fromEarn;
    } else {
      const effBasis = Math.min(Math.max(0, L.basis), dollars);
      fromBasis = Math.min(x, effBasis);
      let rem = x - fromBasis;
      let unseasoned = 0,
        anyFree = false;
      for (let k = 0; k < L.conv.length; k++) {
        unseasoned += L.conv[k].amount;
        if (L.conv[k].free === true) anyFree = true;
      }
      fromConv = Math.min(rem, unseasoned, Math.max(0, dollars - effBasis));
      rem -= fromConv;
      fromEarn = rem;
      // PR 2: only taxable conversion dollars are penalized; the draw takes the entries oldest first (rothSlotApply's order)
      if (anyFree) {
        let left = fromConv;
        convPenalized = 0;
        for (let k = 0; k < L.conv.length && left > 0; k++) {
          const take = Math.min(L.conv[k].amount, left);
          if (L.conv[k].free !== true) convPenalized += take;
          left -= take;
        }
      } else convPenalized = fromConv;
    }
    return {
      fromBasis,
      fromConv,
      earn: st.qualified ? 0 : fromEarn,
      penaltyBase: st.free ? 0 : convPenalized + fromEarn,
    };
  }
  export function rothSlotApply(L, sp) {
    L.basis = Math.max(0, L.basis - sp.fromBasis);
    let c = sp.fromConv;
    while (c > 1e-9 && L.conv.length) {
      const entry = L.conv[0],
        take = Math.min(entry.amount, c);
      entry.amount -= take;
      c -= take;
      if (entry.amount <= 1e-9) L.conv.shift();
    }
  }
