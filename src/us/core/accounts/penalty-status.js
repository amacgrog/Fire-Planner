import { state } from '../../../shared/core/store.js';

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
