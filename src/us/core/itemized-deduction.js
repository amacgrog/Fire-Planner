import { filingKey, SALT_CAP_BY_YEAR, SALT_CAP_FLOOR, SALT_CAP_LAST_YEAR, SALT_PHASE_RATE, SALT_PHASE_START_2025, SENIOR_DEDUCTION_AMOUNT, SENIOR_DEDUCTION_LAST_YEAR, SENIOR_DEDUCTION_PHASE_RATE, SENIOR_PHASE_START, taxYearOf } from './federal-deductions.js';

  // The senior deduction for the return, given its MAGI (zero after the last
  // eligible tax year). It is a deduction from taxable income (not from AGI), so
  // `magi` is the return's income before it. The 6% phase-out reduces EACH eligible
  // person's $6,000 by the same amount, so two eligible spouses lose it entirely at
  // $250,000 joint MAGI (one eligible spouse also at $250,000), a single filer at $175,000.
  export function seniorDeduction(filing, yearIndex, ages, magi) {
    if (taxYearOf(yearIndex) > SENIOR_DEDUCTION_LAST_YEAR) return 0;
    let seniors = 0;
    for (const a of ages) if (a >= 65) seniors++;
    if (!seniors) return 0;
    const start = SENIOR_PHASE_START[filingKey(filing, 'senior')];
    return (
      seniors *
      Math.max(
        0,
        SENIOR_DEDUCTION_AMOUNT - SENIOR_DEDUCTION_PHASE_RATE * Math.max(0, magi - start),
      )
    );
  }
  export function saltCap(yearIndex, magi) {
    const year = taxYearOf(yearIndex);
    if (year > SALT_CAP_LAST_YEAR) return SALT_CAP_FLOOR;
    const cap = SALT_CAP_BY_YEAR[Math.max(2025, year)],
      start = SALT_PHASE_START_2025 * Math.pow(1.01, Math.max(0, year - 2025));
    return Math.max(SALT_CAP_FLOOR, cap - SALT_PHASE_RATE * Math.max(0, magi - start));
  }
  // Deliberately simple itemizing: state income tax + property tax under the SALT
  // cap, plus mortgage interest (already limited to the $750,000 debt cap by the
  // caller), plus the medical expenses over 7.5% of AGI (IRC 213(a), a permanent
  // floor; `magi` stands in for AGI). Charitable gifts and QCDs are not modeled.
  export const MEDICAL_FLOOR_PCT = 0.075;
  export function itemizedDeduction(yearIndex, magi, stateTaxPaid, propertyTax, mortgageInterest, medical = 0) {
    return (
      Math.min(saltCap(yearIndex, magi), Math.max(0, stateTaxPaid) + Math.max(0, propertyTax)) +
      Math.max(0, mortgageInterest) +
      Math.max(0, medical - MEDICAL_FLOOR_PCT * Math.max(0, magi))
    );
  }
