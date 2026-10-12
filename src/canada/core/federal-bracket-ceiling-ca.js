  // RRSP meltdown ladder — withdraws from RRSP each year in the chosen
  // window, solving for the gross withdrawal that fills that person's
  // taxable income up to the top of the selected federal bracket. Net
  // proceeds are assumed moved to TFSA (sufficient TFSA room is assumed,
  // consistent with this planner's simplified-limits approach elsewhere).
  // Unlike a US Roth conversion, no bisection is needed: CPP/OAS are fully
  // taxable with no nonlinear provisional-income step, so income is linear
  // in the withdrawal amount.
  export function federalBracketCeilingCA(pctTarget) {
    const brackets = [
      [14, 58523],
      [20.5, 117045],
      [26, 181440],
      [29.29, 258482],
      [33, 258482],
    ];
    const found = brackets.find(([p]) => p === pctTarget);
    return found ? found[1] : brackets[brackets.length - 1][1];
  }
