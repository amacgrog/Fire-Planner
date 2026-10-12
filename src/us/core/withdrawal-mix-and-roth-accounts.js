import { pct } from '../../shared/core/basics.js';
import { state } from '../../shared/core/store.js';

  // Per-year withdrawal-mix override for the multi-lever optimizer — same
  // idiom as optimizerState.rothBracketByAge above. null in normal operation.
  // Map<Partner-A age, candidate-id-or-0>. Unlike the Roth ladder (which
  // creates NEW discretionary income you choose to generate) or the old
  // gain-harvesting lever it replaces the working half of (removed after
  // real-world testing found its effect was consistently negligible — see
  // docs/reference.md), this is about HOW to fund a spending need that's
  // already mandatory that year — so there's no MAGI cap to size against;
  // minimizing MAGI (to dodge an ACA cliff or IRMAA tier) is exactly what
  // the search is scoring for via rothScheduleCost, which already sums
  // tax+healthcare across the projection. A mapped 0 (or no entry) means
  // "no override this year" — falls through to state.smoothWithdrawals'
  // simple proportional-by-balance rule, then the plain taxable-first
  // default, unchanged.
  // Candidate withdrawal splits the per-year optimizer searches, as
  // [taxable, traditional, roth] fractions of that year's spending need
  // (always summing to 1). 'balanced' is resolved dynamically from that
  // year's live account balances (a 3-way extension of what
  // state.smoothWithdrawals already does 2-way) rather than a fixed
  // triple, since the "right" balance-proportional split obviously shifts
  // as each account drains at a different rate. Deliberately a small,
  // fixed menu rather than a continuous 2-simplex search — richer
  // resolution would multiply the coordinate-ascent search space (already
  // combined with the Roth ladder's own per-year coordinates) far past
  // what a few seconds of browser-side search can cover.
  export const WITHDRAWAL_MIX_CANDIDATES = [0, 'taxable', 'traditional', 'roth', 'balanced', 'smoothed', 'taxTradHalf', 'thirds'];
  export function withdrawalMixWeights(candidate, taxableBal, traditionalBal, rothBal) {
    switch (candidate) {
      case 'taxable':
        return [1, 0, 0];
      case 'traditional':
        return [0, 1, 0];
      case 'roth':
        return [0, 0, 1];
      case 'taxTradHalf':
        return [0.5, 0.5, 0];
      case 'thirds':
        return [1 / 3, 1 / 3, 1 / 3];
      case 'balanced': {
        const pool = taxableBal + traditionalBal + rothBal;
        return pool > 0 ? [taxableBal / pool, traditionalBal / pool, rothBal / pool] : [1 / 3, 1 / 3, 1 / 3];
      }
      case 'smoothed': {
        // Exactly state.smoothWithdrawals' own 2-way formula (taxable +
        // traditional only, proportional to balance, Roth left at 0 here
        // so it only gets tapped via the shortfall fallback below) —
        // included as its own candidate so the mix lever is a strict
        // superset of what the simple smoothWithdrawals toggle can find,
        // not just "usually at least as good" empirically.
        const pool = taxableBal + traditionalBal;
        return pool > 0 ? [taxableBal / pool, traditionalBal / pool, 0] : [0.5, 0.5, 0];
      }
      default:
        return null; // 0, or an unrecognized id — "no override this year"
    }
  }
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
  export function rothAccountsNew() {
    return openingRothBasisSlots().map((basis) => ({ basis, conv: [] }));
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
  // A conversion lands in the converting partner's Roth IRA ([toA, toB] from accountsConvert).
  export function rothAccountsConvert(R, to, year) {
    if (to[0] > 0) R[0].conv.push({ year, amount: to[0] });
    if (to[1] > 0) R[2].conv.push({ year, amount: to[1] });
  }
  // How a gross draw `x` from Roth account `i` (balance `dollars`) splits across its ledger,
  // and what that costs given the owner's status ({free, qualified}, see penaltyStatus):
  // `earn` is the part that is ordinary income, `penaltyBase` the part the 10% applies to.
  export function rothSlotSplit(L, i, dollars, x, st) {
    let fromBasis,
      fromConv = 0,
      fromEarn;
    if (i % 2 === 1) {
      const eps = dollars > 0 ? Math.max(0, 1 - Math.min(Math.max(0, L.basis), dollars) / dollars) : 0;
      fromEarn = x * eps;
      fromBasis = x - fromEarn;
    } else {
      const effBasis = Math.min(Math.max(0, L.basis), dollars);
      fromBasis = Math.min(x, effBasis);
      let rem = x - fromBasis;
      const unseasoned = L.conv.reduce((sum, c) => sum + c.amount, 0);
      fromConv = Math.min(rem, unseasoned, Math.max(0, dollars - effBasis));
      rem -= fromConv;
      fromEarn = rem;
    }
    return {
      fromBasis,
      fromConv,
      earn: st.qualified ? 0 : fromEarn,
      penaltyBase: st.free ? 0 : fromConv + fromEarn,
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
  // Each account's early-withdrawal status this year, one per ACCOUNT_SLOTS slot (IRA A, 401(k) A,
  // IRA B, 401(k) B). The traditional and Roth accounts in a slot share a status: the same owner,
  // the same age rule, and Rule of 55 on the 401(k) only. The deceased partner's accounts (survivor
  // period) are inherited by the spouse as beneficiary: penalty-free and, with the 5-year clock
  // assumed met, tax-free. Everyone else is judged by their own age.
  const SLOT_KINDS = ['ira', 'k401', 'ira', 'k401'];
  export function accountStatuses({ age, ageB, isSurvivorPeriod, deceasedIsA, workingA, workingB, retireAgeA, retireAgeB }) {
    const dead = isSurvivorPeriod ? (deceasedIsA ? 0 : 1) : -1;
    return SLOT_KINDS.map((kind, i) => {
      const partner = i < 2 ? 0 : 1;
      if (partner === dead) return { free: true, qualified: true };
      const own = partner === 0 ? [age, workingA, retireAgeA] : [ageB, workingB, retireAgeB];
      return penaltyStatus(kind, own[0], { rule55: rule55Applies(own[1], own[2], partner) });
    });
  }
  export const ALL_FREE = [0, 1, 2, 3].map(() => ({ free: true, qualified: true }));
  // Account ledger. The engine's balances stay pooled (bal.traditional +
  // bal.bondTraditional, bal.roth + bal.bondRoth: tax, RMDs, ACA/IRMAA, the bond
  // ladder and every table read the pools). Underneath, each pool is split among
  // four accounts, in ACCOUNT_SLOTS order: [IRA A, 401(k) A, IRA B, 401(k) B]
  // (for the Roth pool: Roth IRA A, Roth 401(k) A, Roth IRA B, Roth 401(k) B).
  // The ledger stores each account's SHARE of its pool: growth, ladder/refill
  // moves and draws hit every account in proportion (same-allocation assumption),
  // so shares only change when money enters or leaves one account on its own: a
  // contribution (the owner's account) or a Roth conversion (IRAs first, to keep
  // 401(k) access longest; the money lands in the same partner's Roth IRA). An
  // account's dollars are its share times the pool at that moment. The engine reads
  // each partner's current share (accountsOwnerShareA) for RMD and 72(t) sizing and
  // for the early-withdrawal-penalty blend, and a partner's RMD/72(t) distribution
  // comes out of that partner's own accounts (accountsDraw).
  const ACCOUNT_SLOTS = ['iraA', 'k401A', 'iraB', 'k401B'];
  // Share of a Roth IRA balance assumed to be contributions when no basis is entered.
  const ROTH_BASIS_ASSUMED_PCT = 50;
  // The four retirement accounts' opening balances from the inputs, in ACCOUNT_SLOTS
  // order. Partner B's accounts are ignored in single-person mode.
  export function openingAccounts() {
    const single = !!state.singlePerson,
      b = (v) => (single ? 0 : v);
    return {
      trad: [state.tradIraA, state.trad401kA, b(state.tradIraB), b(state.trad401kB)],
      roth: [state.rothIraA, state.roth401kA, b(state.rothIraB), b(state.roth401kB)],
    };
  }
  export const sumSlots = (a) => a[0] + a[1] + a[2] + a[3];
  // All retirement-account money (traditional + Roth, both partners unless single-person).
  export function retirementTotal() {
    const o = openingAccounts();
    return sumSlots(o.trad) + sumSlots(o.roth);
  }
  // Each account's opening share of its pool (equal split of an empty pool: nothing to divide).
  export function accountsNew() {
    const o = openingAccounts(),
      shares = (a) => {
        const total = sumSlots(a);
        return total > 0 ? a.map((x) => x / total) : [0.25, 0.25, 0.25, 0.25];
      };
    return { trad: shares(o.trad), roth: shares(o.roth) };
  }
  // Opening Roth basis (contributions) per Roth account, in ACCOUNT_SLOTS order: the entered Roth
  // IRA basis (or the assumed share of the balance when none is entered, never more than the
  // balance) and the Roth 401(k) balance times its basis slider, for each partner.
  function openingRothBasisSlots() {
    const o = openingAccounts().roth,
      partner = (p, i) => {
        const entered = state['rothIraBasis' + p];
        return [
          entered > 0 ? Math.min(o[i], entered) : o[i] * pct(ROTH_BASIS_ASSUMED_PCT),
          o[i + 1] * pct(state['roth401kBasisPct' + p]),
        ];
      };
    return [...partner('A', 0), ...partner('B', 2)];
  }
  export function accountsClone(a) {
    return { trad: a.trad.slice(), roth: a.roth.slice() };
  }
  export function accountsRestore(a, snap) {
    for (let i = 0; i < 4; i++) {
      a.trad[i] = snap.trad[i];
      a.roth[i] = snap.roth[i];
    }
  }
  // Dollars per account for a pool worth `pool`.
  export function accountBalances(shares, pool) {
    return shares.map((sh) => sh * pool);
  }
  // `shares` are updated in place to the new dollar mix; they keep their old
  // values when the pool is empty (nothing to divide).
  export function accountsSetFromDollars(shares, dollars) {
    const total = dollars[0] + dollars[1] + dollars[2] + dollars[3];
    if (total > 1e-9) for (let i = 0; i < 4; i++) shares[i] = dollars[i] / total;
  }
  // `amounts` (one per slot) is added to the pool `pool` as it stands before the add.
  export function accountsContribute(shares, pool, amounts) {
    const d = accountBalances(shares, pool);
    for (let i = 0; i < 4; i++) d[i] += amounts[i];
    accountsSetFromDollars(shares, d);
  }
  // Partner A's current share of a pool (their IRA plus their 401(k)).
  export function accountsOwnerShareA(shares) {
    return shares[0] + shares[1];
  }
  // Takes `amounts` ([from A's accounts, from B's accounts]) out of the pool `pool` as it stands
  // before the draw, each pro rata among that partner's own accounts. A partner whose accounts
  // cannot cover their amount (a market drop since the balance the RMD was sized on) is emptied;
  // the pool itself was reduced by the full amount, and the shares are recomputed from the
  // remaining dollars, so the ledger still sums to the pool whatever the shortfall was.
  export function accountsDraw(shares, pool, amounts) {
    const d = accountBalances(shares, pool);
    for (const p of [0, 1]) {
      const own = d[2 * p] + d[2 * p + 1];
      if (own <= 0) continue;
      const f = 1 - Math.min(amounts[p], own) / own;
      d[2 * p] *= f;
      d[2 * p + 1] *= f;
    }
    accountsSetFromDollars(shares, d);
  }
  // A draw of `amounts` (one per slot) out of the specific accounts, from the pool `pool` as it stands
  // before the draw (a 72(t) payment comes out of its own account). An account cannot give more than it
  // holds.
  export function accountsDrawSlots(shares, pool, amounts) {
    const d = accountBalances(shares, pool);
    for (let i = 0; i < 4; i++) d[i] -= Math.min(amounts[i], d[i]);
    accountsSetFromDollars(shares, d);
  }
  // A discretionary draw of `amount` out of the accounts in `group` (slot indices), pro rata among
  // them, from the pool `pool` as it stands before the draw. The other accounts keep their dollars,
  // so shares move toward them. An empty group draws nothing.
  export function accountsDrawGroup(shares, pool, group, amount) {
    const d = accountBalances(shares, pool),
      total = group.reduce((sum, i) => sum + d[i], 0);
    if (!(total > 0) || !(amount > 0)) return;
    const f = 1 - Math.min(amount, total) / total;
    for (const i of group) d[i] *= f;
    accountsSetFromDollars(shares, d);
  }
  // A Roth conversion of `amount` out of the traditional pool `tradPool` into the
  // Roth pool `rothPool`: IRAs first (pro rata between the two IRAs), then 401(k)s
  // (pro rata), never from an account under a running 72(t) plan (`excluded`). Each partner's converted
  // money goes to that partner's Roth IRA. Returns the
  // amount that landed in each partner's Roth IRA, [A, B].
  export function accountsConvert(a, tradPool, rothPool, amount, excluded = null) {
    if (!(amount > 0)) return [0, 0];
    const d = accountBalances(a.trad, tradPool),
      avail = d.map((x, i) => (excluded && excluded[i] ? 0 : x)),
      taken = [0, 0, 0, 0];
    let rem = Math.min(amount, avail[0] + avail[1] + avail[2] + avail[3]);
    for (const group of [[0, 2], [1, 3]]) {
      const have = avail[group[0]] + avail[group[1]],
        take = Math.min(rem, have);
      if (take > 0) for (const i of group) taken[i] = take * (avail[i] / have);
      rem -= take;
    }
    const r = accountBalances(a.roth, rothPool);
    for (let i = 0; i < 4; i++) d[i] -= taken[i];
    r[0] += taken[0] + taken[1];
    r[2] += taken[2] + taken[3];
    accountsSetFromDollars(a.trad, d);
    accountsSetFromDollars(a.roth, r);
    return [taken[0] + taken[1], taken[2] + taken[3]];
  }
  // Rule of 55 (IRC 72(t)(2)(A)(v)): a partner who has stopped working in or after the year they
  // turn 55 (the retirement-age convention, owner decision 16) can take penalty-free
  // distributions from the plan of the employer they left. Needs that partner's checkbox
  // (`partner` 0 = A, 1 = B: ruleOf55A / ruleOf55B).
  export function rule55Applies(working, retireAge, partner) {
    return !!(partner === 0 ? state.ruleOf55A : state.ruleOf55B) && !working && retireAge >= 55;
  }
  // Early-withdrawal (10% additional tax) status of one account for one year, from the
  // account kind ('ira' | 'k401', traditional or Roth) and its owner's age. `free` is true
  // when a discretionary draw from the account owes no 10% tax: the owner is 59.5 or older, or
  // the account is a 401(k) (traditional or Roth) and Rule of 55 applies to the owner. IRAs never
  // get Rule of 55. `qualified` (59.5 or older) is stricter: it also means a Roth draw owes no
  // income tax on its earnings (the 5-year clock is assumed met), whereas a Rule-of-55 Roth 401(k)
  // draw is penalty-free but its earnings are still taxed. Forced amounts (RMD, SEPP) are never
  // penalized and do not go through here.
  export function penaltyStatus(kind, ownerAge, { rule55 = false } = {}) {
    const isPlan = kind === 'k401';
    const qualified = ownerAge >= 59.5;
    return { free: qualified || (isPlan && rule55), qualified };
  }
  // Safe-MAGI headroom left for discretionary draws this year: the conversion has already used
  // part of the ceiling.
  export function incomeRoom(magiSafeRoom, conversionAmount) {
    return Math.max(0, magiSafeRoom - conversionAmount);
  }
