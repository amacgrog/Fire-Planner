// The text of the decision-question cards

import { decisionDeltaPhrase } from '../../shared/core/analysis/decisions.js';
import { money } from '../../shared/core/format/numbers.js';
import { runHistoricalCycles, simulate } from '../../shared/core/projection/simulate.js';
import { state } from '../../shared/core/store.js';
import { setChartView } from '../../shared/ui/chart-view-mode.js';
import { switchToDashboardTab } from '../../shared/ui/mobile-view.js';

  export const DECISION_QUESTIONS = {
    retireTiming: {
      kind: 'compare',
      run() {
        const current = simulate(),
          earlierA = Math.max(state.ageA, state.retireAgeA - 3),
          earlierB = Math.max(state.ageB, state.retireAgeB - 3),
          laterA = Math.min(70, state.retireAgeA + 3),
          laterB = Math.min(70, state.retireAgeB + 3),
          earlier = simulate(earlierA, earlierB),
          later = simulate(laterA, laterB);
        const rows = [
          { label: `3 yrs earlier (age ${earlierA})`, sim: earlier },
          { label: `Current (age ${state.retireAgeA})`, sim: current },
          { label: `3 yrs later (age ${laterA})`, sim: later },
        ];
        const sentence = `Retiring 3 years earlier ${decisionDeltaPhrase(current, earlier)} compared with your current plan. Retiring 3 years later ${decisionDeltaPhrase(current, later)}.`;
        return { rows, sentence };
      },
    },
    buyVsRent: {
      kind: 'compare',
      run() {
        const saved = state.tenure;
        state.tenure = 'own';
        const own = simulate();
        state.tenure = 'rent';
        const rent = simulate();
        state.tenure = saved;
        const rows = [
          { label: `Own${saved === 'own' ? ' (current)' : ''}`, sim: own },
          { label: `Rent${saved === 'rent' ? ' (current)' : ''}`, sim: rent },
        ];
        const rentThenBuyNote =
          saved === 'rentThenBuy'
            ? ` Your plan currently rents, then buys at Partner A age ${state.buyAge} — this comparison shows the two pure endpoints instead.`
            : '';
        const sentence = `Renting instead of owning ${decisionDeltaPhrase(own, rent)} compared with owning outright.${rentThenBuyNote}`;
        return { rows, sentence };
      },
    },
    rothLadder: {
      kind: 'compare',
      run() {
        const saved = state.meltdownEnabled;
        state.meltdownEnabled = false;
        const off = simulate();
        state.meltdownEnabled = true;
        const on = simulate();
        state.meltdownEnabled = saved;
        const rows = [
          { label: 'No RRSP meltdown', sim: off },
          {
            label: `RRSP meltdown (age ${state.meltdownStartAge}-${state.meltdownEndAge}, to ${state.meltdownBracket}% bracket)`,
            sim: on,
          },
        ];
        const sentence = `Running the RRSP meltdown ladder as configured ${decisionDeltaPhrase(off, on)} compared with no meltdown.`;
        return { rows, sentence };
      },
    },
    mortgagePayoff: {
      kind: 'compare',
      // Only relevant with an actual current mortgage — the button itself
      // is hidden for tenure !== 'own' in syncControls(), so this only runs
      // when there's a real balance to accelerate.
      run() {
        const saved = state.extraPrincipal,
          // If the user hasn't set an extra-principal amount, $500/mo is a
          // reasonable stand-in so the comparison has something to show —
          // otherwise both rows would be identical (0 vs. 0).
          payExtra = saved > 0 ? saved : 500;
        state.extraPrincipal = 0;
        const invest = simulate();
        state.extraPrincipal = payExtra;
        const pay = simulate();
        state.extraPrincipal = saved;
        const rows = [
          { label: `Invest instead (no extra principal)${saved === 0 ? ' (current)' : ''}`, sim: invest },
          { label: `Pay extra ${money(payExtra)}/mo${saved === payExtra ? ' (current)' : ''}`, sim: pay },
        ];
        const sentence = `Paying an extra ${money(payExtra)}/mo toward the mortgage instead of investing it ${decisionDeltaPhrase(invest, pay)} compared with investing the difference.`;
        return { rows, sentence };
      },
    },
    longevity: {
      kind: 'compare',
      run() {
        const savedA = state.lifeExpectancyA,
          savedB = state.lifeExpectancyB;
        const current = simulate();
        state.lifeExpectancyA = Math.min(110, savedA + 10);
        state.lifeExpectancyB = state.singlePerson ? savedB : Math.min(110, savedB + 10);
        const longer = simulate();
        state.lifeExpectancyA = savedA;
        state.lifeExpectancyB = savedB;
        const rows = [
          { label: `Current (plan through age ${savedA})`, sim: current },
          { label: `Live 10 years longer (age ${Math.min(110, savedA + 10)})`, sim: longer },
        ];
        const sentence = `Planning for 10 more years than your current life expectancy ${decisionDeltaPhrase(current, longer)}.`;
        return { rows, sentence };
      },
    },
    sensitivity: {
      kind: 'open',
      open() {
        switchToDashboardTab();
        const card = document.getElementById('sensitivityCard');
        card.open = true;
        card.dispatchEvent(new Event('toggle'));
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
    returns: {
      kind: 'open',
      open() {
        switchToDashboardTab();
        setChartView('hist');
        document.getElementById('mainChartCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      note() {
        const { cycles, successRate } = runHistoricalCycles();
        if (!cycles.length) return '';
        return `Replayed against every real ${cycles.length}-year stretch of S&P 500 history since ${cycles[0].startYear}, this plan survived to the end of the projection in ${(successRate * 100).toFixed(0)}% of starting years.`;
      },
    },
  };
