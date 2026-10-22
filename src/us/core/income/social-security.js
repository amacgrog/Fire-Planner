// US Social Security income by year, with the earnings test and claiming text

  // Social Security for the year, each partner's own benefit once they reach
  // their claiming age, inflated by `factor`. In the survivor period the
  // household keeps the greater of the two benefits (a simplified
  // survivor-benefit swap, not the full PIA/FRA rules).
  export function socialSecurityIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }) {
    let ssA = (age >= ctx.inputs.ssStartAgeA ? ctx.inputs.ssMonthlyA * 12 : 0) * factor,
      ssB = singlePerson ? 0 : (ageB >= ctx.inputs.ssStartAgeB ? ctx.inputs.ssMonthlyB * 12 : 0) * factor;
    if (isSurvivorPeriod) {
      // Simplified survivor-benefit swap: the survivor keeps the greater
      // of the two benefits (each computed as if both were still alive),
      // rather than modeling full PIA/FRA-based survivor benefit rules.
      const survivorSS = Math.max(ssA, ssB);
      if (deceasedIsA) {
        ssA = 0;
        ssB = survivorSS;
      } else {
        ssB = 0;
        ssA = survivorSS;
      }
    }
    const ss = ssA + ssB;
    return { ssA, ssB, ss };
  }
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
  export function ssBeforeRetirementCase(ctx, p) {
    if (p === 'B' && ctx.inputs.singlePerson) return null;
    const start = ctx.inputs['ssStartAge' + p],
      retire = ctx.inputs['retireAge' + p],
      fra = fullRetirementAgeMonths(ctx.taxYear - ctx.inputs['age' + p]) / 12;
    if (!(ctx.inputs['ssMonthly' + p] > 0) || !(ctx.inputs['income' + p] > 0)) return null;
    return start < retire && start < fra ? { start, retire, fra } : null;
  }
  export function fraText(fra) {
    const years = Math.floor(fra),
      months = Math.round((fra - years) * 12);
    return months ? years + ' and ' + months + ' months' : String(years);
  }
