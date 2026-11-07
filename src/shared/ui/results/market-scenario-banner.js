// The market scenario banner and its Revert button

import { describeMarketScenario } from '../../core/format/market-scenario-text.js';
import { CURRENT_YEAR } from '../../core/inputs/current-year.js';
import { state } from '../../core/store.js';
import { scenarioSnapshot } from '../plans/market-scenario-snapshot.js';
import { revertMarketScenario } from '../plans/market-scenario-mode.js';

  // The description of the scenario that is on, or null when none is.
  export function currentMarketScenarioText() {
    return scenarioSnapshot && state.marketScenario ? describeMarketScenario(state.marketScenario, state, CURRENT_YEAR) : null;
  }
  // Shown while a scenario is on, with the one-line description of what it does.
  export function renderMarketScenarioBanner() {
    const banner = document.getElementById('marketScenarioBanner');
    const text = currentMarketScenarioText();
    if (text === null) {
      banner.hidden = true;
      return;
    }
    document.getElementById('marketScenarioBannerText').textContent = `Market scenario on: ${text}. Every number here assumes it; changes are not saved.`;
    banner.hidden = false;
  }
  export function wireMarketScenarioBanner() {
    document.getElementById('marketScenarioRevertBtn').addEventListener('click', () => revertMarketScenario());
  }
