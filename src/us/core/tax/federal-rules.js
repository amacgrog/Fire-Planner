import { currentYear } from '../tax-year.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';

  // ---- Federal deductions --------------------------------------------------
  // The tax year of plan year `yearIndex` is `currentYear + yearIndex` (the clock
  // the engines already use for RMD birth years; tests pin it). Statutory
  // amounts that are NOT inflation-indexed carry the law's own year limits.
  //
  // Temporary senior deduction (IRC 151(d)(5)(C), added by the 2025 budget
  // reconciliation act, P.L. 119-21 section 70103): $6,000 per filer aged 65+,
  // tax years 2025 through 2028 ONLY, reduced by 6% of MAGI over $75,000
  // (single) / $150,000 (joint), allowed whether or not the filer itemizes.
  // REVISIT if Congress extends it, when tax details are next updated for 2027:
  // change SENIOR_DEDUCTION_LAST_YEAR (and tests/deductions.js, which pins the
  // 2028/2029 cutoff).
  export const SENIOR_DEDUCTION_LAST_YEAR = 2028;
  const SENIOR_DEDUCTION_AMOUNT = 6000;
  const SENIOR_DEDUCTION_PHASE_RATE = 0.06;
  // SALT cap (IRC 164(b)(7), same act): the limit on the state and local tax
  // deduction (income + property tax). Reduced by 30% of MAGI over a threshold
  // ($500,000 in 2025, +1% a year) but never below $10,000; both rise 1% a year
  // through 2029 and the cap is a flat $10,000 again from 2030. Explicit year
  // table, so REVISIT it with the senior deduction above if Congress changes it.
  const SALT_CAP_BY_YEAR = { 2025: 40000, 2026: 40400, 2027: 40804, 2028: 41212, 2029: 41624 };
  const SALT_CAP_LAST_YEAR = 2029;
  const SALT_CAP_FLOOR = 10000; // the permanent cap, and the phase-down floor
  const SALT_PHASE_RATE = 0.3;
  const SALT_PHASE_START_2025 = 500000;
  // Acquisition-debt limit for mortgage interest (permanent after the 2025 act).
  const MORTGAGE_DEBT_LIMIT = 750000;
  export function taxYearOf(yearIndex) {
    return currentYear + Math.floor(yearIndex);
  }
  // Standard deduction: the 2026 base (Rev. Proc. 2025-32) plus the additional
  // amount for each filer on the return aged 65+ ($1,650 married / $2,050
  // unmarried in 2026), all indexed by the tax-parameter factor. `ages` lists
  // the filers on this return (one for a single return, two for MFJ).
  // Filing-status table. Each status names, per parameter family, which data row it
  // reads, so a status that mixes families (a qualifying surviving spouse uses the
  // joint brackets but the single thresholds) is data, not a new branch. `joint` is
  // the structural flag: the return combines both partners' income. A status the
  // table does not know reads as single. Family keys: brackets, deduction (base),
  // extraAge (the 65+ add-on), gains (0%/15% bands), ss (Social Security base
  // amounts), niit, medicare (Additional Medicare Tax), irmaa, senior (senior
  // deduction phase-out start), ctc (child-credit phase-out start). Each state's own row (STATE_RULES.statusAs) says which
  // state-tax column a status reads.
  export const FILING = {
    mfj: { joint: true, brackets: 'mfj', deduction: 'mfj', extraAge: 'mfj', gains: 'mfj', ss: 'mfj', niit: 'mfj', medicare: 'mfj', irmaa: 'mfj', senior: 'mfj', ctc: 'mfj' },
    single: { joint: false, brackets: 'single', deduction: 'single', extraAge: 'single', gains: 'single', ss: 'single', niit: 'single', medicare: 'single', irmaa: 'single', senior: 'single', ctc: 'single' },
    // Head of household: unmarried with a qualifying child. Own brackets, standard deduction and
    // gain bands; every threshold set by statute for "any other case" is the single one.
    hoh: { joint: false, brackets: 'hoh', deduction: 'hoh', extraAge: 'hoh', gains: 'hoh', ss: 'single', niit: 'single', medicare: 'single', irmaa: 'single', senior: 'single', ctc: 'single' },
    // Qualifying surviving spouse (two years after the death year, with a qualifying child): the joint
    // brackets, standard deduction (and its married 65+ add-on) and gain bands, but the single
    // Social Security bases, Additional Medicare Tax, IRMAA table and senior phase-out start
    // (IRC 86(c), 3101(b)(2), CMS, 151(d)(5)(C): "joint return" thresholds only). The NIIT is the
    // joint $250,000: IRC 1411(b)(1) names "a joint return or a surviving spouse". State tax
    // reads the joint column in a state's own row unless it says otherwise (STATE_RULES.statusAs).
    qss: { joint: false, brackets: 'mfj', deduction: 'mfj', extraAge: 'mfj', gains: 'mfj', ss: 'single', niit: 'mfj', medicare: 'single', irmaa: 'single', senior: 'single', ctc: 'single' },
  };
  export const filingRow = (filing) => FILING[filing] || FILING.single;
  export const filingKey = (filing, family) => filingRow(filing)[family];
  // Base 2026 amounts per data row (Rev. Proc. 2025-32), before the tax-index factor.
  const STD_DEDUCTION = { mfj: 32200, single: 16100, hoh: 24150 };
  const STD_EXTRA_65 = { mfj: 1650, single: 2050, hoh: 2050 };
  export const SENIOR_PHASE_START = { mfj: 150000, single: 75000 };
  export const NIIT_THRESHOLD = { mfj: 250000, single: 200000 };
  export const GAIN_BANDS = { mfj: [98900, 613700], single: [49450, 545500], hoh: [66200, 579600] };
  // Social Security taxation: [lower base, upper base, cap on the 50% tier].
  export const SS_BASE = { mfj: [32000, 44000, 6000], single: [25000, 34000, 4500] };
  export const ORDINARY_BRACKETS = {
    mfj: [
      [24800, 0.1],
      [100800, 0.12],
      [211400, 0.22],
      [403550, 0.24],
      [512450, 0.32],
      [768700, 0.35],
      [Infinity, 0.37],
    ],
    single: [
      [12400, 0.1],
      [50400, 0.12],
      [105700, 0.22],
      [201775, 0.24],
      [256225, 0.32],
      [640600, 0.35],
      [Infinity, 0.37],
    ],
    hoh: [
      [17700, 0.1],
      [67450, 0.12],
      [105700, 0.22],
      [201750, 0.24],
      [256200, 0.32],
      [640600, 0.35],
      [Infinity, 0.37],
    ],
  };
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
  const MEDICAL_FLOOR_PCT = 0.075;
  export function itemizedDeduction(yearIndex, magi, stateTaxPaid, propertyTax, mortgageInterest, medical = 0) {
    return (
      Math.min(saltCap(yearIndex, magi), Math.max(0, stateTaxPaid) + Math.max(0, propertyTax)) +
      Math.max(0, mortgageInterest) +
      Math.max(0, medical - MEDICAL_FLOOR_PCT * Math.max(0, magi))
    );
  }
  export function standardDeduction(filing, yearIndex, ages = []) {
    const factor = taxIndexFactor(yearIndex);
    let deduction = STD_DEDUCTION[filingKey(filing, 'deduction')] * factor;
    const extra = STD_EXTRA_65[filingKey(filing, 'extraAge')] * factor;
    for (const a of ages) if (a >= 65) deduction += extra;
    return deduction;
  }
  // Roth conversion ladder — converts traditional balances to Roth each year
  // in the chosen window, solving for the gross conversion that fills
  // ordinary taxable income up to the top of the selected federal bracket
  // (recomputing taxable Social Security as the conversion is added).
  export function bracketCeilingReal(pctTarget, filing) {
    // Every bracket but the open-ended top one, as [percent, ceiling].
    const brackets = ORDINARY_BRACKETS[filingKey(filing, 'brackets')]
      .filter(([cap]) => cap !== Infinity)
      .map(([cap, rate]) => [Math.round(rate * 100), cap]);
    const found = brackets.find(([p]) => p === pctTarget);
    return found ? found[1] : brackets[brackets.length - 1][1];
  }
  // What one return deducts: the larger of the (age-adjusted) standard deduction
  // and the itemized total, plus the senior deduction on top of either. `agi` is
  // the return's income before the deduction (it stands in for MAGI).
  export function federalDeduction(filing, yearIndex, ages, agi, stateTaxPaid, propertyTax, mortgageInterest, medical = 0) {
    let deduction = standardDeduction(filing, yearIndex, ages);
    if (stateTaxPaid > 0 || propertyTax > 0 || mortgageInterest > 0 || (medical > 0 && medical > MEDICAL_FLOOR_PCT * agi))
      deduction = Math.max(
        deduction,
        itemizedDeduction(yearIndex, agi, stateTaxPaid, propertyTax, mortgageInterest, medical),
      );
    return deduction + seniorDeduction(filing, yearIndex, ages, agi);
  }
  // Share of mortgage interest that is deductible given the original loan size.
  export function mortgageInterestShare(originalPrincipal) {
    return originalPrincipal > MORTGAGE_DEBT_LIMIT ? MORTGAGE_DEBT_LIMIT / originalPrincipal : 1;
  }
  export const SS_WAGE_BASE = 184500; // 2026 Social Security wage base (SSA), indexed with taxIndexFactor
