// The market scenario card's preview: the market and portfolio charts and the summary

import { displayValueOf } from '../../core/format/display-value.js';
import { planLastAge } from '../../core/format/market-scenario-text.js';
import { previewSummaryText } from '../../core/format/market-scenario-preview-text.js';
import { compact } from '../../core/format/numbers.js';
import { cardSettingsToScenario } from '../../core/inputs/market-scenario-card.js';
import { normalizeMarketScenario } from '../../core/inputs/market-scenario.js';
import { simulateWith } from '../../core/projection/runs.js';
import { scenarioMarketPath } from '../../core/projection/scenario-source.js';
import { simulate } from '../../core/projection/simulate.js';
import { state } from '../../core/store.js';
import { chartAxisColor } from '../charts/chart-colors.js';
import { drawMiniLines } from '../charts/mini-line-chart.js';
import { scenarioSnapshot } from '../plans/market-scenario-snapshot.js';
import { stateContextFor } from './state-context.js';

  // The settings the last preview drew, for the resize redraw.
  let lastSettings = null;
  const BLUE = '#2563eb',
    RED = '#dc4c64';

  // Draws the preview for `settings` (the card's), or the running note while a scenario is on.
  export function renderMarketScenarioPreview(settings) {
    const preview = document.getElementById('msPreview');
    if (scenarioSnapshot !== null) {
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    lastSettings = settings;
    const ms = normalizeMarketScenario(cardSettingsToScenario(settings)),
      ctxFor = stateContextFor(),
      scen = simulateWith(ctxFor({ ...state, marketScenario: ms })),
      base = ms.order === 'standard' ? simulate() : simulateWith(ctxFor({ ...state, marketScenario: { kind: 'plan', order: 'bucket' } }));
    const real = (r) => displayValueOf('real', state.inflation, r.total, r.year, r.cumFactor);
    const path = scenarioMarketPath({ ...state, marketScenario: ms });
    drawMiniLines(document.getElementById('msMarketChart'), {
      xs: path.ages,
      series: [
        { values: path.plan, color: chartAxisColor(), dash: [4, 3] },
        { values: path.scenario, color: RED },
      ],
      yFormat: (v) => v.toFixed(1) + '×',
    });
    drawMiniLines(document.getElementById('msPortfolioChart'), {
      xs: base.rows.map((r) => r.age),
      series: [
        { values: base.rows.map(real), color: BLUE },
        { values: scen.rows.map(real), color: RED },
      ],
      yFormat: compact,
    });
    document.getElementById('msSummary').textContent = previewSummaryText(
      {
        scenDepletedAge: scen.depletedAge ?? null,
        baseDepletedAge: base.depletedAge ?? null,
        lastAge: planLastAge(state),
        scenEnd: real(scen.rows.at(-1)),
        baseEnd: real(base.rows.at(-1)),
      },
      compact
    );
  }

  // A new card width redraws the charts from the last settings (as the Sankey does); only while the card is open.
  export function wireMarketScenarioPreview() {
    const card = document.getElementById('marketScenarioCard');
    let pending = false;
    window.addEventListener('resize', () => {
      if (pending || !card.open || !lastSettings) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (card.open && lastSettings) renderMarketScenarioPreview(lastSettings);
      });
    });
  }
