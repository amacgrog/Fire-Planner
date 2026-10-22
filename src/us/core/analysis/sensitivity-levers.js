// US sensitivity (tornado) levers: the assumptions swept up and down

import { simulateWith } from '../../../shared/core/projection/runs.js';

  // Sensitivity ("tornado") analysis: for each of a handful of key
  // assumptions, sweeps it up and down by a fixed amount and records the
  // resulting end-assets value, holding every other input fixed. Each lever's
  // run(base, contextFor, endValue) builds each variant as a shallow copy of
  // `base` with the one field changed ({ ...base, field: value }), runs it with
  // the context its caller's factory gives it (contextFor(variant)), and hands
  // endValue(sim, inputs) the variant's own inputs (the inflation lever's end
  // value is converted with the variant's inflation). This is a
  // one-at-a-time sensitivity sweep, not a joint/probabilistic analysis like
  // Monte Carlo — it answers "which single assumption matters most," not
  // "what's the range of likely outcomes." Which levers actually run is
  // controlled by the checkboxes in #sensLeverToggles (data-lever id ↔
  // this array's `id`), so a lever with no visible impact on your plan (e.g.
  // long-term care cost, if you haven't enabled LTC) can be left unchecked
  // rather than cluttering the chart with a zero-width bar.
  // The lower variant, then the higher, each run and measured in that order.
  function swing(contextFor, endValue, low, high) {
    const decrease = endValue(simulateWith(contextFor(low)), low);
    const increase = endValue(simulateWith(contextFor(high)), high);
    return { decrease, increase };
  }
  export const SENSITIVITY_LEVERS = [
    {
      id: 'return',
      label: 'Investment return (±2pp)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, returnRate: base.returnRate - 2 }, { ...base, returnRate: base.returnRate + 2 }),
    },
    {
      id: 'retireAge',
      label: 'Retirement age (±3 yrs)',
      run: (base, contextFor, endValue) => {
        const decrease = endValue(
          simulateWith(
            contextFor(base),
            Math.max(base.ageA, base.retireAgeA - 3),
            Math.max(base.ageB, base.retireAgeB - 3),
          ),
          base,
        );
        const increase = endValue(
          simulateWith(contextFor(base), Math.min(70, base.retireAgeA + 3), Math.min(70, base.retireAgeB + 3)),
          base,
        );
        return { decrease, increase };
      },
    },
    {
      id: 'spending',
      label: 'Household spending (±10%)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, spending: base.spending * 0.9 }, { ...base, spending: base.spending * 1.1 }),
    },
    {
      id: 'inflation',
      label: 'Inflation (±1pp)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, inflation: Math.max(0, base.inflation - 1) }, { ...base, inflation: base.inflation + 1 }),
    },
    {
      id: 'bondReturn',
      label: 'Bond return (±2pp)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, bondReturn: base.bondReturn - 2 }, { ...base, bondReturn: base.bondReturn + 2 }),
    },
    {
      id: 'hysa',
      label: 'HYSA / cash rate (±1pp)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, hysaRate: Math.max(0, base.hysaRate - 1) }, { ...base, hysaRate: base.hysaRate + 1 }),
    },
    {
      id: 'homeGrowth',
      label: 'Home appreciation (±1pp)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, homeGrowth: base.homeGrowth - 1 }, { ...base, homeGrowth: base.homeGrowth + 1 }),
    },
    {
      id: 'healthcare',
      label: 'Healthcare premium (±20%)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, healthcare: base.healthcare * 0.8 }, { ...base, healthcare: base.healthcare * 1.2 }),
    },
    {
      id: 'medicare',
      label: 'Medicare cost (±20%)',
      run: (base, contextFor, endValue) =>
        swing(contextFor, endValue, { ...base, medicareYearly: base.medicareYearly * 0.8 }, { ...base, medicareYearly: base.medicareYearly * 1.2 }),
    },
    {
      id: 'ltc',
      label: 'Long-term care cost (±20%)',
      run: (base, contextFor, endValue) =>
        swing(
          contextFor,
          endValue,
          { ...base, ltcYearlyA: base.ltcYearlyA * 0.8, ltcYearlyB: base.ltcYearlyB * 0.8 },
          { ...base, ltcYearlyA: base.ltcYearlyA * 1.2, ltcYearlyB: base.ltcYearlyB * 1.2 },
        ),
    },
    {
      id: 'ss',
      label: 'Social Security (±10%)',
      run: (base, contextFor, endValue) =>
        swing(
          contextFor,
          endValue,
          { ...base, ssMonthlyA: base.ssMonthlyA * 0.9, ssMonthlyB: base.ssMonthlyB * 0.9 },
          { ...base, ssMonthlyA: base.ssMonthlyA * 1.1, ssMonthlyB: base.ssMonthlyB * 1.1 },
        ),
    },
  ];
