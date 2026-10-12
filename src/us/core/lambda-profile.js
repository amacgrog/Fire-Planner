import { NO_DEPENDENTS } from '../../shared/core/lists-and-children.js';

  // The future tax on one traditional dollar (lambda) and on one dollar of long-term gain (tauGain), read
  // from three synthetic future years: Partner A's first RMD year, a midpoint, and a survivor year (the year
  // after the first death: the survivor-modeling death year, else the earlier life expectancy) or the plan's
  // last year. Each walks today's traditional pool forward at the plan's real return, net of the traditional
  // share of this year's need (c.need, c.tradShare; both 0: no draws). A sample prices the traditional income
  // the walk assumes that year, the larger of the RMD on the owner's age and that year's draw (spec 13.2); if
  // the draws empty the pool before a sample year, the sample moves to the year that empties it. It adds Social
  // Security and pensions in this year's dollars and measures the marginal federal + state tax plus IRMAA (on
  // Medicare's MAGI, irmaaMagiOf: only the taxable part of Social Security; per person on two returns) over a step
  // of 10% of that income (at least $1,000), under this year's tax law and indexing.
  export const LAMBDA_PROFILE = { filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 0, ageB: null, singlePerson: true, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: NO_DEPENDENTS, seOn: false };
