// makeProjectedExpense: builds the per-year household expense reader

import { baseSpendingNominal, itemGrowthFactor } from './spending-and-loans.js';
import { medicalGrowth } from '../projection/year-factors.js';
import { housingForYear } from '#country/core/seam-housingForYear';

  // Projected total living expense for a future year in nominal dollars at the plan's
  // assumed inflation: spending + healthcare + LTC + shelter + recurring extra expenses.
  // Sizes the pre-retirement bond ladder.
  export function makeProjectedExpense(ctx, { infl, wageGrowth, schedule, futureBuy, singlePerson, retireAgeA, retireAgeB }) {
    return (year) => {
      const factor = Math.pow(1 + infl, year);
      const shelter = housingForYear(ctx, year, factor, schedule, futureBuy).housing;
      const ageA = ctx.inputs.ageA + year,
        ageB = ctx.inputs.ageB + year;
      const healthcare = singlePerson
        ? (ageA >= retireAgeA ? ctx.inputs.healthcare : 0) * factor * medicalGrowth(ctx, year)
        : (ageA >= retireAgeA ? ctx.inputs.healthcare / 2 : 0) * factor * medicalGrowth(ctx, year) +
          (ageB >= retireAgeB ? ctx.inputs.healthcare / 2 : 0) * factor * medicalGrowth(ctx, year);
      const ltc = ctx.inputs.ltcEnabled
        ? (ageA >= ctx.inputs.ltcAgeA ? ctx.inputs.ltcYearlyA : 0) * factor * medicalGrowth(ctx, year) +
          (!singlePerson && ageB >= ctx.inputs.ltcAgeB ? ctx.inputs.ltcYearlyB : 0) * factor * medicalGrowth(ctx, year)
        : 0;
      const extraRecurring = ctx.inputs.extraExpenses
        .filter((e) => ageA >= e.startAge && ageA <= e.endAge)
        .reduce(
          (sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, Math.pow(1 + wageGrowth, year)),
          0,
        );
      return baseSpendingNominal(ctx, ageA, year, factor, factor) + healthcare + ltc + shelter + extraRecurring;
    };
  }
