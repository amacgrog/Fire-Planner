  // Pension income for the year (which partner(s) are covered is set by
  // state.pensionCoverage; the single-person case always uses Partner A's
  // pension). The deceased partner's pension drops out in the survivor period.
  function pensionIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }) {
    let pensionA =
        ((singlePerson || state.pensionCoverage === 'a' || state.pensionCoverage === 'both') &&
        age >= state.pensionStartAgeA
          ? state.pensionYearlyA
          : 0) * factor,
      pensionB =
        (!singlePerson &&
        (state.pensionCoverage === 'b' || state.pensionCoverage === 'both') &&
        ageB >= state.pensionStartAgeB
          ? state.pensionYearlyB
          : 0) * factor;
    if (isSurvivorPeriod) {
      if (deceasedIsA) pensionA = 0;
      else pensionB = 0;
    }
    const pension = pensionA + pensionB;
    return { pensionA, pensionB, pension };
  }
