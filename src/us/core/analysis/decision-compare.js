// Renders the decision-compare table rows for the US planner

import { escapeHtml, compact } from '../../../shared/core/format/numbers.js';
import { decisionEndAssets } from '../../../shared/core/analysis/decisions.js';
import { displayValue } from '../../../shared/core/format/charts.js';
import { state } from '../../../shared/core/store.js';

  export function renderDecisionCompareTable(rows) {
    // "Investments last through" follows the same "Age {maxLifeExpectancy}+"
    // convention as the main scenario-compare table and the conversion-ladder
    // optimizer table (computeScenarioMetrics()/renderRothOptimizer() above) —
    // a plan that never depletes is described by the age it was actually
    // modeled to, not the word "Never", which read as an error/edge-case
    // rather than a healthy outcome.
    const maxLifeExpectancy = Math.max(
      state.lifeExpectancyA,
      state.singlePerson ? 0 : state.lifeExpectancyB,
    );
    const body = rows
      .map(({ label, sim }) => {
        const r = sim.rows.find((row) => row.year === sim.retirementYear) || sim.rows[0];
        const lastsTo = sim.depletedAge ? `Age ${sim.depletedAge}` : `Age ${maxLifeExpectancy}+`;
        return `<tr><td>${escapeHtml(label)}</td><td>${compact(displayValue(r.investable, r.year))}</td><td><span class="table-status ${sim.depletedAge ? 'fail' : ''}">${lastsTo}</span></td><td>${compact(decisionEndAssets(sim))}</td></tr>`;
      })
      .join('');
    return `<div class="table-wrap decision-table-wrap"><table class="decision-compare-table"><thead><tr><th>Scenario</th><th>Investable</th><th>Lasts to</th><th>End assets</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
