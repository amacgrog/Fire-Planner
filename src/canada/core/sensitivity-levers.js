import { simulate } from '../../shared/core/simulate.js';
import { state } from '../../shared/core/store.js';

  // Sensitivity ("tornado") analysis: for each of a handful of key
  // assumptions, sweeps it up and down by a fixed amount (mutate/simulate/
  // restore, same pattern as simulateAtRealCagr() below) and records the
  // resulting end-assets value, holding every other input fixed. This is a
  // one-at-a-time sensitivity sweep, not a joint/probabilistic analysis like
  // Monte Carlo — it answers "which single assumption matters most," not
  // "what's the range of likely outcomes." Which levers actually run is
  // controlled by the checkboxes in #sensLeverToggles (data-lever id ↔
  // this array's `id`), so a lever with no visible impact on your plan (e.g.
  // long-term care cost, if you haven't enabled LTC) can be left unchecked
  // rather than cluttering the chart with a zero-width bar.
  export const SENSITIVITY_LEVERS = [
    {
      id: 'return',
      label: 'Investment return (±2pp)',
      run: (endValue) => {
        const saved = state.returnRate;
        state.returnRate = saved - 2;
        const decrease = endValue(simulate());
        state.returnRate = saved + 2;
        const increase = endValue(simulate());
        state.returnRate = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'retireAge',
      label: 'Retirement age (±3 yrs)',
      run: (endValue) => {
        const decrease = endValue(
          simulate(
            Math.max(state.ageA, state.retireAgeA - 3),
            Math.max(state.ageB, state.retireAgeB - 3),
          ),
        );
        const increase = endValue(
          simulate(Math.min(70, state.retireAgeA + 3), Math.min(70, state.retireAgeB + 3)),
        );
        return { decrease, increase };
      },
    },
    {
      id: 'spending',
      label: 'Household spending (±10%)',
      run: (endValue) => {
        const saved = state.spending;
        state.spending = saved * 0.9;
        const decrease = endValue(simulate());
        state.spending = saved * 1.1;
        const increase = endValue(simulate());
        state.spending = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'inflation',
      label: 'Inflation (±1pp)',
      run: (endValue) => {
        const saved = state.inflation;
        state.inflation = Math.max(0, saved - 1);
        const decrease = endValue(simulate());
        state.inflation = saved + 1;
        const increase = endValue(simulate());
        state.inflation = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'bondReturn',
      label: 'Bond return (±2pp)',
      run: (endValue) => {
        const saved = state.bondReturn;
        state.bondReturn = saved - 2;
        const decrease = endValue(simulate());
        state.bondReturn = saved + 2;
        const increase = endValue(simulate());
        state.bondReturn = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'hysa',
      label: 'HYSA / cash rate (±1pp)',
      run: (endValue) => {
        const saved = state.hysaRate;
        state.hysaRate = Math.max(0, saved - 1);
        const decrease = endValue(simulate());
        state.hysaRate = saved + 1;
        const increase = endValue(simulate());
        state.hysaRate = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'homeGrowth',
      label: 'Home appreciation (±1pp)',
      run: (endValue) => {
        const saved = state.homeGrowth;
        state.homeGrowth = saved - 1;
        const decrease = endValue(simulate());
        state.homeGrowth = saved + 1;
        const increase = endValue(simulate());
        state.homeGrowth = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'healthcare',
      label: 'Healthcare premium (±20%)',
      run: (endValue) => {
        const saved = state.healthcare;
        state.healthcare = saved * 0.8;
        const decrease = endValue(simulate());
        state.healthcare = saved * 1.2;
        const increase = endValue(simulate());
        state.healthcare = saved;
        return { decrease, increase };
      },
    },
    {
      id: 'ltc',
      label: 'Long-term care cost (±20%)',
      run: (endValue) => {
        const savedA = state.ltcYearlyA,
          savedB = state.ltcYearlyB;
        state.ltcYearlyA = savedA * 0.8;
        state.ltcYearlyB = savedB * 0.8;
        const decrease = endValue(simulate());
        state.ltcYearlyA = savedA * 1.2;
        state.ltcYearlyB = savedB * 1.2;
        const increase = endValue(simulate());
        state.ltcYearlyA = savedA;
        state.ltcYearlyB = savedB;
        return { decrease, increase };
      },
    },
    {
      id: 'ss',
      label: 'CPP + OAS (±10%)',
      run: (endValue) => {
        const savedCppA = state.cppMonthlyA,
          savedCppB = state.cppMonthlyB,
          savedOasA = state.oasMonthlyA,
          savedOasB = state.oasMonthlyB;
        state.cppMonthlyA = savedCppA * 0.9;
        state.cppMonthlyB = savedCppB * 0.9;
        state.oasMonthlyA = savedOasA * 0.9;
        state.oasMonthlyB = savedOasB * 0.9;
        const decrease = endValue(simulate());
        state.cppMonthlyA = savedCppA * 1.1;
        state.cppMonthlyB = savedCppB * 1.1;
        state.oasMonthlyA = savedOasA * 1.1;
        state.oasMonthlyB = savedOasB * 1.1;
        const increase = endValue(simulate());
        state.cppMonthlyA = savedCppA;
        state.cppMonthlyB = savedCppB;
        state.oasMonthlyA = savedOasA;
        state.oasMonthlyB = savedOasB;
        return { decrease, increase };
      },
    },
  ];
