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
