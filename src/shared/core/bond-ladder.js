  // The pre-retirement bond ladder plan: the target is the sum of the first bondYears of
  // projected expenses starting at retirement, built up linearly over the years before
  // retirement (rotateIntoBondLadder does the moving).
  export function planBondLadder({ retirementYear, bondYears, projectedExpense }) {
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
