  // are reported whenever any of them helps, because they're a specific,
  // non-obvious diagnosis. Only when none of them help does it fall back to
  // the generic levers everyone always has (spending, retirement timing) —
  // for those it searches for the smallest magnitude of change that actually
  // resolves the shortfall (rather than testing one arbitrary fixed amount),
  // so the person can judge whether the "fix" is a minor tweak or a major
  // compromise, which is the real judgment call for someone genuinely
  // deciding between working longer and spending less.
  function findMinimalSpendingCut(selected) {
    if (!(state.spending > 0)) return null;
    const saved = state.spending;
    let resolvedAt = null;
    for (let cutPct = 5; cutPct <= 90; cutPct += 5) {
      state.spending = saved * (1 - cutPct / 100);
      const r = simulate();
      if (!r.depletedAge) {
        resolvedAt = { cutPct, result: r };
        break;
      }
    }
    if (resolvedAt) {
      state.spending = saved;
      return {
        label: 'household spending',
        detail: `cutting household spending by ${resolvedAt.cutPct}%`,
        result: resolvedAt.result,
        magnitude: resolvedAt.cutPct / 90,
        resolved: true,
      };
    }
    state.spending = saved * 0.1; // largest tested cut: 90%
    const r90 = simulate();
    state.spending = saved;
    const improvement = r90.depletedAge ? r90.depletedAge - selected.depletedAge : 0;
    if (improvement <= 0) return null;
    return {
      label: 'household spending',
      detail: 'even a 90% cut to household spending',
      result: r90,
      improvement,
      magnitude: 1,
      resolved: false,
    };
  }
  function findMinimalRetirementDelay(selected) {
    const secondAge = (yrs) => (state.singlePerson ? state.retireAgeB : state.retireAgeB + yrs);
    for (let yrs = 1; yrs <= 15; yrs++) {
      const r = simulate(state.retireAgeA + yrs, secondAge(yrs));
      if (!r.depletedAge) {
        return {
          label: 'retirement timing',
          detail: `retiring ${yrs} year${yrs === 1 ? '' : 's'} later`,
          result: r,
          magnitude: yrs / 15,
          resolved: true,
        };
      }
    }
    const r15 = simulate(state.retireAgeA + 15, secondAge(15));
    const improvement = r15.depletedAge ? r15.depletedAge - selected.depletedAge : 0;
    if (improvement <= 0) return null;
    return {
      label: 'retirement timing',
      detail: 'even retiring 15 years later',
      result: r15,
      improvement,
      magnitude: 1,
      resolved: false,
    };
  }
