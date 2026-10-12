import { MORTGAGE_DEBT_LIMIT } from './federal-deductions.js';

  // Share of mortgage interest that is deductible given the original loan size.
  export function mortgageInterestShare(originalPrincipal) {
    return originalPrincipal > MORTGAGE_DEBT_LIMIT ? MORTGAGE_DEBT_LIMIT / originalPrincipal : 1;
  }
