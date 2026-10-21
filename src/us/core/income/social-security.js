import { state } from '../../../shared/core/store.js';

  // Social Security for the year, each partner's own benefit once they reach
  // their claiming age, inflated by `factor`. In the survivor period the
  // household keeps the greater of the two benefits (a simplified
  // survivor-benefit swap, not the full PIA/FRA rules).
  export function socialSecurityIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }) {
    let ssA = (age >= state.ssStartAgeA ? state.ssMonthlyA * 12 : 0) * factor,
      ssB = singlePerson ? 0 : (ageB >= state.ssStartAgeB ? state.ssMonthlyB * 12 : 0) * factor;
    if (isSurvivorPeriod) {
      // Simplified survivor-benefit swap: the survivor keeps the greater
      // of the two benefits (each computed as if both were still alive),
      // rather than modeling full PIA/FRA-based survivor benefit rules.
      const survivorSS = Math.max(ssA, ssB);
      if (deceasedIsA) {
        ssA = 0;
        ssB = survivorSS;
      } else {
        ssB = 0;
        ssA = survivorSS;
      }
    }
    const ss = ssA + ssB;
    return { ssA, ssB, ss };
  }
