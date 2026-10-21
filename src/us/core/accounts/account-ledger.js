import { pct } from '../../../shared/core/basics.js';
import { state } from '../../../shared/core/store.js';
import { rule55Applies, penaltyStatus } from './penalty-status.js';

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
  export function openingRothBasisSlots() {
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
