  function computeSensitivity(selected) {
    const finalValue = (sim) => {
      const r = sim.rows.at(-1);
      return displayValue(r.total, r.year);
    };
    // If the *current* plan is projected to deplete before the end of the
    // modeled horizon, every row from the depletion age onward floors at
    // $0 — so "end assets" would show $0 for every single bar, hiding real
    // differences between assumptions (one lever might still deplete at 60,
    // another at 89, both reading as an identical, uninformative $0). Peak
    // portfolio value doesn't have that floor, so fall back to it in that
    // case; a healthy plan's peak is usually its final row anyway (assets
    // still growing or holding steady at the end), so this only changes
    // behavior in the depleted case it's meant to fix. The decision is made
    // once, from the baseline/current scenario, so every bar in the chart
    // is measuring the same thing rather than switching metric bar to bar.
    const peakValue = (sim) => Math.max(...sim.rows.map((r) => displayValue(r.total, r.year)));
    const usePeak = finalValue(selected) <= 1;
    const endValue = usePeak ? peakValue : finalValue;
    const baseline = endValue(selected);
    const checked = new Set(
      [...document.querySelectorAll('#sensLeverToggles input[data-lever]:checked')].map(
        (el) => el.dataset.lever,
      ),
    );
    const levers = SENSITIVITY_LEVERS.filter((l) => checked.has(l.id));
    const results = levers.map((l) => {
      const { decrease, increase } = l.run(endValue);
      return {
        label: l.label,
        decrease,
        increase,
        low: Math.min(decrease, increase),
        high: Math.max(decrease, increase),
      };
    });
    results.sort((a, b) => b.high - b.low - (a.high - a.low));
    return { baseline, results, usePeak };
  }
