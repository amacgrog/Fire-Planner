// US Social Security income by year (one benefit formula for the engine, the cliff plan and the Sankey), with the earnings test and claiming text

  // The share of scheduled Social Security paid in projection year `year` (feedback B2): 1, or 1 less the benefit cut from
  // January of its calendar start year on (a what-if: the trust fund running out, or a higher full retirement age).
  // `(100 - pct) / 100`, so 22% is the double nearest 0.78. C4's means test (a later item) will multiply its own per-year
  // share, passed in by the caller, into `paid` below; this stays the input-driven part.
  export function ssPaidShare(ctx, year) {
    const pct = ctx.inputs.ssBenefitCutPct;
    return pct > 0 && ctx.taxYear + year >= ctx.inputs.ssBenefitCutStartYear ? (100 - pct) / 100 : 1;
  }
  // Full retirement age in months by birth year (SSA, POMS RS 00615.003): 65 to 1937, +2 months a year to 66 for 1943-1954,
  // +2 months a year to 67 for 1960 and later. The birth year is the tax year less the age input (the plan stores ages).
  export function ssFullRetirementAgeMonths(birthYear) {
    if (birthYear <= 1937) return 65 * 12;
    if (birthYear <= 1942) return 65 * 12 + 2 * (birthYear - 1937);
    if (birthYear <= 1954) return 66 * 12;
    if (birthYear >= 1960) return 67 * 12;
    return 66 * 12 + 2 * (birthYear - 1954);
  }
  // The own-benefit factor of a claim at `claimAge` (clamped to 62-70) for a full retirement age of `fraMonths` (SS PR 1,
  // spec 5.1): minus 5/9 of 1% a month for the first 36 months early and 5/12 of 1% beyond, plus 2/3 of 1% a month late
  // (POMS RS 00615.101, RS 00615.692). Counted in whole units of 1/3600 (20, 15 and 24 a month) and divided once, so a claim
  // at 62 with an FRA of 67 is the double nearest 0.7 (2520 / 3600), not 1 - 0.2 - 0.1.
  export function ssClaimFactor(fraMonths, claimAge) {
    const m = fraMonths - 12 * Math.min(70, Math.max(62, claimAge));
    if (m > 0) return (3600 - 20 * Math.min(m, 36) - 15 * Math.max(0, m - 36)) / 3600;
    return (3600 - 24 * m) / 3600;
  }
  // The age partner `p`'s factor is read at, before the clamp (spec 7.1): the start age while already collecting (a start age
  // after the current age cannot be one already collecting, so it is read as not collecting); else the later of the start age
  // and the current age ("claims now": a start age already past is a claim this year).
  export function ssFactorAge(ctx, p) {
    const inputs = ctx.inputs,
      start = p === 'A' ? inputs.ssStartAgeA : inputs.ssStartAgeB,
      age = p === 'A' ? inputs.ageA : inputs.ageB;
    return (p === 'A' ? inputs.ssCollectingA : inputs.ssCollectingB) === true && start <= age ? start : Math.max(start, age);
  }
  // Partner `p`'s claim factor: 1 when the amount is entered as paid at the start age (`atClaim`, the default); in the `pia`
  // basis the amount is the benefit at full retirement age and this is ssClaimFactor at ssFactorAge.
  export function ssOwnFactor(ctx, p) {
    const inputs = ctx.inputs;
    if ((p === 'A' ? inputs.ssBenefitBasisA : inputs.ssBenefitBasisB) !== 'pia') return 1;
    return ssClaimFactor(ssFullRetirementAgeMonths(ctx.taxYear - (p === 'A' ? inputs.ageA : inputs.ageB)), ssFactorAge(ctx, p));
  }
  // Partner `p`'s own benefit in the year they are `a`, inflated by `factor` and paid at `paid` (ssPaidShare). `atClaim` keeps
  // the order every copy of this formula had (monthly x 12, then factor, then paid), so no figure moves; `pia` multiplies the
  // claim factor in after the 12. A start age below the current age pays from year 0 in both bases.
  export function ownBenefitYearly(ctx, p, a, factor, paid) {
    const inputs = ctx.inputs;
    if (!(a >= (p === 'A' ? inputs.ssStartAgeA : inputs.ssStartAgeB))) return 0 * factor * paid;
    const yearly = (p === 'A' ? inputs.ssMonthlyA : inputs.ssMonthlyB) * 12;
    return ((p === 'A' ? inputs.ssBenefitBasisA : inputs.ssBenefitBasisB) === 'pia' ? yearly * ssOwnFactor(ctx, p) : yearly) * factor * paid;
  }
  // The survivor's yearly benefit after a death, Partner A at `ageA` and B at `ageB` that year: the greater of the two own
  // benefits (each as if both were alive), a simplified swap. `deceasedIsA` and `deathYear` are for the survivor rules of SS
  // PR 2 (the deceased's base and the survivor's age reduction); the cliff plan passes its implied death.
  export function survivorBenefitYearly(ctx, deceasedIsA, deathYear, ageA, ageB, factor, paid) {
    return Math.max(ownBenefitYearly(ctx, 'A', ageA, factor, paid), ownBenefitYearly(ctx, 'B', ageB, factor, paid));
  }
  // Social Security for the year, each partner's own benefit once they reach their claiming age, inflated by `factor`. In the
  // survivor period the survivor's slot takes survivorBenefitYearly and the deceased's is 0. Both are paid at ssPaidShare (the
  // benefit-cut what-if; exactly 1 by default, so nothing moves).
  export function socialSecurityIncome(ctx, { year, age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA, deathYear }) {
    const paid = ssPaidShare(ctx, year);
    let ssA, ssB;
    if (isSurvivorPeriod) {
      const survivorSS = survivorBenefitYearly(ctx, deceasedIsA, deathYear, age, ageB, factor, paid);
      ssA = deceasedIsA ? 0 : survivorSS;
      ssB = deceasedIsA ? survivorSS : 0;
    } else {
      ssA = ownBenefitYearly(ctx, 'A', age, factor, paid);
      ssB = singlePerson ? 0 : ownBenefitYearly(ctx, 'B', ageB, factor, paid);
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
  export function ssBeforeRetirementCase(ctx, p) {
    if (p === 'B' && ctx.inputs.singlePerson) return null;
    const start = ctx.inputs['ssStartAge' + p],
      retire = ctx.inputs['retireAge' + p],
      fra = ssFullRetirementAgeMonths(ctx.taxYear - ctx.inputs['age' + p]) / 12;
    if (!(ctx.inputs['ssMonthly' + p] > 0) || !(ctx.inputs['income' + p] > 0)) return null;
    return start < retire && start < fra ? { start, retire, fra } : null;
  }
  export function fraText(fra) {
    const years = Math.floor(fra),
      months = Math.round((fra - years) * 12);
    return months ? years + ' and ' + months + ' months' : String(years);
  }
