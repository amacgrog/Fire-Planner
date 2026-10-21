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
