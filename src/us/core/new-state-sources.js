import { NO_DEPENDENTS } from '../../shared/core/lists-and-children.js';

  // The state-tax inputs of one return. taxFor refills one of these per call instead of allocating a new object (and
  // arrays) for every call: stateIncomeTax reads it and keeps nothing, and the two returns of the two-filer branch
  // use two objects because both are built before either is evaluated. The per-person fields are only written (and
  // so only valid) when the selected row reads them (rule.needsPerPerson); every row reads the others.
  function newStateSources(agesCount) {
    return {
      wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: new Array(agesCount).fill(0),
      pensionA: 0, pensionB: 0, retirementA: 0, retirementB: 0, retirement401kA: 0, retirement401kB: 0, federalTax: 0,
      ssBenefits: 0, ssBenefitsA: 0, ssBenefitsB: 0, taxableSSA: 0, taxableSSB: 0,
      dependents: NO_DEPENDENTS, propertyTax: 0, rent: 0,
      // E1e: an inherited traditional draw by partner (slot A of its own sources for a second return) and the New York decedent room.
      inherited: 0, inheritedA: 0, inheritedB: 0, inheritedExclA: 0, inheritedExclB: 0,
    };
  }
  export const SOURCES_JOINT = newStateSources(2),
    SOURCES_SINGLE = newStateSources(1),
    SOURCES_A = newStateSources(1),
    SOURCES_B = newStateSources(1);
  // E1c: the qualified business income deduction (IRC 199A), federal only, below AGI. 2026 limits from Rev. Proc. 2025-32
  // section 4.26 (threshold indexed; the phase-in width is a fixed statutory amount since OBBBA section 70105). Every
  // business is treated as a specified service business with no W-2 wages and no property (owner decision): full 20%
  // up to the threshold, 20% x ap^2 inside the range, nothing above; capped at 20% of taxable income less net capital
  // gain (which includes qualified dividends). The $400 minimum (IRC 199A(i)) applies after the cap, to a taxpayer with
  // $1,000 of QBI from qualified businesses: an SSTB counts only at the applicable percentage, and not at all above the
  // range (199A(d)(1)(A), (d)(3)).
  export const QBI_LIMITS = { threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum: 400, minimumQbi: 1000 };
