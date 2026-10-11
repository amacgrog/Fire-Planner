  // Projected total living expense for a future year in nominal dollars at the plan's
  // assumed inflation: spending + healthcare + LTC + shelter + recurring extra expenses.
  // Sizes the pre-retirement bond ladder.
  function makeProjectedExpense({ infl, wageGrowth, schedule, futureBuy, singlePerson, retireAgeA, retireAgeB }) {
    return (year) => {
      const factor = Math.pow(1 + infl, year);
      const shelter = housingForYear(year, factor, schedule, futureBuy).housing;
      const ageA = state.ageA + year,
        ageB = state.ageB + year;
      const healthcare = singlePerson
        ? (ageA >= retireAgeA ? state.healthcare : 0) * factor * medicalGrowth(year)
        : (ageA >= retireAgeA ? state.healthcare / 2 : 0) * factor * medicalGrowth(year) +
          (ageB >= retireAgeB ? state.healthcare / 2 : 0) * factor * medicalGrowth(year);
      const ltc = state.ltcEnabled
        ? (ageA >= state.ltcAgeA ? state.ltcYearlyA : 0) * factor * medicalGrowth(year) +
          (!singlePerson && ageB >= state.ltcAgeB ? state.ltcYearlyB : 0) * factor * medicalGrowth(year)
        : 0;
      const extraRecurring = state.extraExpenses
        .filter((e) => ageA >= e.startAge && ageA <= e.endAge)
        .reduce(
          (sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, Math.pow(1 + wageGrowth, year)),
          0,
        );
      return baseSpendingNominal(ageA, year, factor, factor) + healthcare + ltc + shelter + extraRecurring;
    };
  }
  // The pre-retirement bond ladder plan: the target is the sum of the first bondYears of
  // projected expenses starting at retirement, built up linearly over the years before
  // retirement (rotateIntoBondLadder does the moving).
  function planBondLadder({ retirementYear, bondYears, projectedExpense }) {
    const bondYearsCeil = Math.max(0, Math.ceil(bondYears)),
      bondWhole = Math.floor(bondYears),
      bondFrac = bondYears - bondWhole;
    const ladderTranches = Array.from({ length: bondWhole }, (_, i) =>
      projectedExpense(retirementYear + i),
    );
    if (bondFrac > 0) ladderTranches.push(projectedExpense(retirementYear + bondWhole) * bondFrac);
    const ladderTarget = ladderTranches.reduce((a, b) => a + b, 0);
    const rotationStartYear = Math.max(0, retirementYear - bondYearsCeil),
      rotationEndYear = retirementYear >= 1 ? retirementYear - 1 : Math.max(0, bondYearsCeil - 1);
    return { ladderTranches, ladderTarget, rotationStartYear, rotationEndYear };
  }
