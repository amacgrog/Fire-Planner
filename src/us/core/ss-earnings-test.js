import { state } from '../../shared/core/store.js';
import { currentYear } from './tax-year.js';

  // Social Security before retirement (7O O5; US only). The earnings test is not modeled (see the Social Security
  // notes), so a partner whose benefit starts before both their retirement age and their full retirement age gets
  // the whole benefit while wages continue. SSA: the benefit is withheld at $1 for every $2 of earnings over
  // $24,480 in 2026 ($1 for every $3 over $65,160 in the year full retirement age is reached) until that age,
  // and a permanently higher benefit from then on returns the months withheld. A condition-based item of the
  // "Worth a second look" list (see `check` and `message` in computeUnusualAssumptions).
  export const SS_EARNINGS_TEST_2026 = { lower: 24480, higher: 65160 };
  // Full retirement age in months by birth year (SSA, Normal Retirement Age table).
  function fullRetirementAgeMonths(birthYear) {
    if (birthYear <= 1954) return 66 * 12;
    if (birthYear >= 1960) return 67 * 12;
    return 66 * 12 + 2 * (birthYear - 1954);
  }
  export function ssBeforeRetirementCase(p) {
    if (p === 'B' && state.singlePerson) return null;
    const start = state['ssStartAge' + p],
      retire = state['retireAge' + p],
      fra = fullRetirementAgeMonths(currentYear - state['age' + p]) / 12;
    if (!(state['ssMonthly' + p] > 0) || !(state['income' + p] > 0)) return null;
    return start < retire && start < fra ? { start, retire, fra } : null;
  }
  export function fraText(fra) {
    const years = Math.floor(fra),
      months = Math.round((fra - years) * 12);
    return months ? years + ' and ' + months + ' months' : String(years);
  }
