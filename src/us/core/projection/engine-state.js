// US engine state: MAGI iteration limits and run counters

  // The ACA subsidy is a function of this year's MAGI, which includes this
  // year's own discretionary withdrawals — but those are sized off the year's
  // spending need, which includes the premium the subsidy sets. Each engine
  // resolves that circularity by re-running the year body from a snapshot with
  // an updated estimate of the discretionary income until the estimate agrees
  // with what the withdrawals actually realized (within MAGI_ITER_TOL dollars).
  export const MAGI_ITER_MAX = 8,
    MAGI_ITER_TOL = 1;
  // "The same premium" (Batch 5 follow-ups S3, Task 8c, ruling 17): two passes of a year whose healthcare is priced off the MAGI
  // estimate were charged the same premium when their charges are within PREMIUM_SAME_TOL dollars; the iteration's update then
  // skips the damped step and option Y's secant may run. Why $0.01: no step of the premium schedule is that small (the 400% cliff,
  // the Medicaid and 100% lines and the 133% step of the applicable percentage are tens to thousands of dollars), and the continuous
  // part moves at most about $0.20 per dollar of MAGI per return (twice that summed over two returns), so two charges within a cent
  // mean estimates within a few cents of each other or no step crossed; a cent is far above the rounding noise of the fill
  // (`estTrad + conversion` is the bracket top only to rounding: charges differ by up to about $0.0004) and far below any step.
  export const PREMIUM_SAME_TOL = 0.01;
  // Years that ended the MAGI iteration through the forced pass (7O follow-up F5), and years that hit the cap on a cost step with no
  // pass to force; planMissed: plan years (choose / apply) whose final realized MAGI missed the plan's target (a plan wins only
  // when it met its line, so this guards an invariant). Counted for the phase of the year that is kept. seFixed / seAlternative (E1c
  // decisions 10 and 11): years whose kept phase held the consistent 162(l) deduction / Rev. Proc. 2014-41's alternative calculation.
  // capPicked (Batch 5 follow-ups S2, Task 4b): years whose kept phase ended in the cap pick (a year whose fill read the draw, with no
  // premium priced off an estimate, re-running its smallest-drift pass at the cap; never also counted forced).
  export const magiStats = { forced: 0, unresolved: 0, planMissed: 0, seFixed: 0, seAlternative: 0, capPicked: 0 };
  // Cliff plan (spec 2026-10-07): what `apply` did with each intent (filled in by apply; cumulative, tests reset each key).
  // Batch 5 step 4d (D11): split intent years, kept split phases and skipped intents (splitYears = splitApplied + splitSkipped).
  // Batch 5 step 5b piece 3: sized conversion years, counted on the kept pass of a year that resolved its target: carried
  // (convApplied) or not carried, converting the user's bracket instead (convFellBack); convYears = convApplied + convFellBack.
  // Conversion start search (plan 2026-11-08-conversion-start-search.md): startSearches, the plannings that ran the search (mode not 'off').
  export const planStats = { intentYears: 0, applied: 0, skippedSide: 0, skippedIneligible: 0, fallback: 0, absent: 0, nextTier: 0, rothShift: 0, irmaaStayUnders: 0, irmaaZeroSaving: 0, orderYears: 0, orderApplied: 0, orderSkipped: 0, splitYears: 0, splitApplied: 0, splitSkipped: 0, orderTracks: 0, convYears: 0, convApplied: 0, convFellBack: 0, startSearches: 0 };
