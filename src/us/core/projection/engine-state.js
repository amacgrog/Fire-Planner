// US engine state: MAGI iteration limits, run counters and the cliff-plan cache

  // The ACA subsidy is a function of this year's MAGI, which includes this
  // year's own discretionary withdrawals — but those are sized off the year's
  // spending need, which includes the premium the subsidy sets. Each engine
  // resolves that circularity by re-running the year body from a snapshot with
  // an updated estimate of the discretionary income until the estimate agrees
  // with what the withdrawals actually realized (within MAGI_ITER_TOL dollars).
  export const MAGI_ITER_MAX = 8,
    MAGI_ITER_TOL = 1;
  // Years that ended the MAGI iteration through the forced pass (7O follow-up F5), and years that hit the cap on a cost step with no
  // pass to force; planMissed: plan years (choose / apply) whose final realized MAGI missed the plan's target (a plan wins only
  // when it met its line, so this guards an invariant). Counted for the phase of the year that is kept. seFixed / seAlternative (E1c
  // decisions 10 and 11): years whose kept phase held the consistent 162(l) deduction / Rev. Proc. 2014-41's alternative calculation.
  export const magiStats = { forced: 0, unresolved: 0, planMissed: 0, seFixed: 0, seAlternative: 0 };
  // Cliff plan (spec 2026-10-07): what `apply` did with each intent (filled in by apply; cumulative, tests reset each key).
  export const planStats = { intentYears: 0, applied: 0, skippedSide: 0, skippedIneligible: 0, fallback: 0, absent: 0, rothShift: 0, irmaaStayUnders: 0, irmaaZeroSaving: 0 };
  // load-time: creates an empty cache Map; reads nothing
  export const cliffPlanCache = new Map(), // JSON of a swapped-in state -> its plan (planForState)
    CLIFF_PLAN_CACHE_MAX = 16;
