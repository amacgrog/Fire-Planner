  // "Explore a question" menu: a handful of pre-wired comparisons over
  // logic that already exists elsewhere (simulate()'s retireAgeA/B override
  // params, and the mutate/simulate/restore idiom SENSITIVITY_LEVERS uses),
  // presented as a plain-language answer instead of another chart to
  // interpret. `compare` questions render a small table + takeaway sentence
  // into #decisionAnswer; `open` questions just scroll to and open an
  // existing card. Keep this list short and additive — each entry should
  // reuse a comparison the app already knows how to run, not invent new
  // modeling.
  function decisionEndAssets(sim) {
    const r = sim.rows.at(-1);
    return displayValue(r.total, r.year);
  }
  function decisionDepletionLabel(sim) {
    return sim.depletedAge ? `age ${sim.depletedAge}` : 'the end of the plan';
  }
  function decisionDeltaPhrase(fromSim, toSim) {
    const fromEnd = decisionEndAssets(fromSim),
      toEnd = decisionEndAssets(toSim),
      delta = toEnd - fromEnd,
      // Once a plan is fully depleted, "end assets" is $0 either way — the
      // real story is the depletion age, not a meaningless $0 delta.
      assetsPart =
        fromEnd <= 1 && toEnd <= 1
          ? 'still depletes the portfolio either way'
          : `${delta >= 0 ? 'adds' : 'costs'} ${compact(Math.abs(delta))} in end assets`;
    if (fromSim.depletedAge === toSim.depletedAge) return assetsPart;
    return `${assetsPart} and moves your depletion point from ${decisionDepletionLabel(fromSim)} to ${decisionDepletionLabel(toSim)}`;
  }
