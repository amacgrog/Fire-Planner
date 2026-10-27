// US early-withdrawal penalty status: Rule of 55, Roth free caps, penalized money

  // Rule of 55 (IRC 72(t)(2)(A)(v)): a partner who has stopped working in or after the year they
  // turn 55 (the retirement-age convention, owner decision 16) can take penalty-free
  // distributions from the plan of the employer they left. Needs that partner's checkbox
  // (`partner` 0 = A, 1 = B: ruleOf55A / ruleOf55B of the plan inputs `inputs`).
  export function rule55Applies(inputs, working, retireAge, partner) {
    return !!(partner === 0 ? inputs.ruleOf55A : inputs.ruleOf55B) && !working && retireAge >= 55;
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
  // The accounts of the traditional pool that are penalty-free (or penalized) this year for a
  // discretionary draw, and their share of the pool. wd.onlyPartner (0 = A, 1 = B, -1 both) limits it to one partner's
  // accounts: the split draw (takeTraditionalSplit, fillTraditional) sets it while it draws that partner.
  export function tradGroup(wd, penalized) {
    const slots = [0, 1, 2, 3].filter(
      (i) => !wd.seppActive[i] && wd.status[i].free === !penalized && (wd.onlyPartner < 0 || (i < 2 ? 0 : 1) === wd.onlyPartner),
    );
    return { slots, share: slots.reduce((sum, i) => sum + wd.accts.trad[i], 0) };
  }
  // A group's room in `bucket`: its accounts' whole dollars (`share` of the pool `pool`, stock + bond bucket), never more than
  // the bucket. Not their share of the bucket: the ledger renormalizes the shares after every draw, so once a group that is only
  // part of the pool (a SEPP slot, mixed penalty status, the split draw's one partner, one penalized candidate) has drawn from one
  // bucket, its share of the other bucket understates what it holds, and a stock call followed by a bond call left its money
  // undrawn (it then went to penalized money or home equity; in takePenalized the cheapest candidate never emptied).
  export function groupRoom(bal, bucket, share, pool) {
    return Math.min(bal[bucket], share * pool);
  }
  // True when some account holding money would owe the 10% on a discretionary draw: a penalized
  // traditional account, or a Roth account whose owner is neither 59.5+ nor covered by Rule of 55.
  // While it is true the withdrawal order protects the penalty-free money (see withdrawStandard).
  export function hasPenalizedMoney(wd) {
    const { bal, accts, status } = wd;
    if (bal.traditional + bal.bondTraditional > 0 && tradGroup(wd, true).share > 0) return true;
    return bal.roth + bal.bondRoth > 0 && [0, 1, 2, 3].some((i) => !status[i].free && accts.roth[i] > 0);
  }
  // Gross room per Roth account for a penalty-free draw from `bucket`: an account whose owner is
  // free (59.5+, inherited, or a 401(k) under Rule of 55) all of it; an early Roth IRA only its
  // basis (contributions and seasoned conversions, in whichever bucket); an early Roth 401(k) none (every draw is
  // partly earnings). A room is the account's whole free dollars, in whichever bucket (as groupRoom), not capped at the bucket one
  // by one, so rothDraw's weights stay pro rata; their sum can be more than the bucket, and rothDraw caps the draw at the bucket.
  export function rothFreeCaps(wd, bucket) {
    const { bal, accts, status, rothAccts } = wd,
      pool = bal.roth + bal.bondRoth;
    return accts.roth.map((sh, i) => {
      const dollars = sh * pool;
      if (!(dollars > 0)) return 0;
      const frac = status[i].free ? 1 : i % 2 === 1 ? 0 : Math.min(Math.max(0, rothAccts[i].basis), dollars) / dollars;
      return dollars * frac;
    });
  }
