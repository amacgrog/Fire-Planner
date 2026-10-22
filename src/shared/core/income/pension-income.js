// pensionIncome: a partner's pension and annuity income for one year

  // Pension income for the year (which partner(s) are covered is set by
  // ctx.inputs.pensionCoverage; the single-person case always uses Partner A's
  // pension). The deceased partner's pension drops out in the survivor period.
  export function pensionIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }) {
    let pensionA =
        ((singlePerson || ctx.inputs.pensionCoverage === 'a' || ctx.inputs.pensionCoverage === 'both') &&
        age >= ctx.inputs.pensionStartAgeA
          ? ctx.inputs.pensionYearlyA
          : 0) * factor,
      pensionB =
        (!singlePerson &&
        (ctx.inputs.pensionCoverage === 'b' || ctx.inputs.pensionCoverage === 'both') &&
        ageB >= ctx.inputs.pensionStartAgeB
          ? ctx.inputs.pensionYearlyB
          : 0) * factor;
    if (isSurvivorPeriod) {
      if (deceasedIsA) pensionA = 0;
      else pensionB = 0;
    }
    const pension = pensionA + pensionB;
    return { pensionA, pensionB, pension };
  }
