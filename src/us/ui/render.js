import { compact } from '../../shared/core/money-format.js';
import { simulate } from '../../shared/core/monte-carlo-paths-2.js';
import { displayValue, fiMultiple } from '../../shared/core/spending-and-loans.js';
import { mode, state } from '../../shared/core/store.js';
import { getBondYears } from '../../shared/core/year-factors.js';
import { renderTable } from '../../shared/ui/chart-render.js';
import { renderDecisionQuestionPreviews } from '../../shared/ui/decision-questions.js';
import { computeCountedEstimateIds, markDefaultFields, renderEstimateBadges } from '../../shared/ui/estimate-badges.js';
import { renderEstimatedRollup } from '../../shared/ui/estimate-review.js';
import { renderPlanStatusBar } from '../../shared/ui/plan-status-bar.js';
import { renderPlanHeadline } from '../../shared/ui/render-plan-headline.js';
import { renderRothOptimizer } from '../../shared/ui/roth-optimizer-card.js';
import { renderSankey } from '../../shared/ui/sankey.js';
import { renderScenarioComparison } from '../../shared/ui/scenario-comparison.js';
import { renderShortfallBanner } from '../../shared/ui/shortfall-banner.js';
import { renderTornadoChart } from '../../shared/ui/tornado.js';
import { renderUnusualAssumptions } from '../../shared/ui/unusual-warnings.js';
import { cliffPlanStore } from '../core/cliff-plan-store.js';
import { cliffPlanSummary } from '../core/cliff-plan-summary.js';
import { refreshCliffPlan } from '../core/refresh-cliff-plan.js';
import { STATE_TAX_NOT_MODELED_NOTE, stateTaxTipText } from '../core/state-rules.js';
import { retirementTotal } from '../core/withdrawal-mix-and-roth-accounts.js';
import { annotateAppealRows, annotateInheritedRows, annotateSolverRows } from './annotate-solver-rows.js';
import { renderChartView } from './chart-view.js';
import { renderGroupSummaries } from './render-group-summaries.js';
import { renderMultiLeverAppliedStatus } from './render-multi-lever-applied-status.js';
import { stateTaxTreatmentNote } from './state-tax-treatment-note.js';
import { updateChartXAxisButtons } from './update-chart-xaxis-buttons.js';

  export function render() {
    // The cliff plan for this state, before anything projects (every run below applies it).
    refreshCliffPlan();
    document.body.classList.toggle('single-person', !!state.singlePerson);
    markDefaultFields();
    renderGroupSummaries();
    const countedEstimateIds = computeCountedEstimateIds();
    renderEstimateBadges(countedEstimateIds);
    renderEstimatedRollup(countedEstimateIds);
    const selected = simulate();
    const retirement =
        selected.rows.find((r) => r.year === selected.retirementYear) || selected.rows[0],
      end = selected.rows.at(-1);
    document.getElementById('retireAssets').textContent = compact(
      displayValue(retirement.investable, retirement.year),
    );
    document.getElementById('dashRetireAge').textContent = state.singlePerson
      ? `Age ${state.retireAgeA}`
      : `A ${state.retireAgeA} / B ${state.retireAgeB}`;
    document.getElementById('retireNW').textContent = compact(
      displayValue(retirement.total, retirement.year),
    );
    document.getElementById('retireAssetsSub').textContent = state.singlePerson
      ? `when retired at age ${retirement.age}`
      : `when both retire (A ${retirement.age} / B ${retirement.ageB})`;
    const lasts = document.getElementById('lastsTo');
    lasts.textContent = selected.depletedAge
      ? `Age ${selected.depletedAge}`
      : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    lasts.className = selected.depletedAge ? 'negative' : 'positive';
    document.getElementById('lastsSub').textContent = selected.depletedAge
      ? 'Projected shortfall begins'
      : 'No projected depletion';
    const preRetirement = selected.rows.find((r) => r.year === selected.retirementYear - 1),
      bondRow = preRetirement || retirement,
      bondAtRetirement = bondRow.bonds;
    document.getElementById('bondLadder').textContent = compact(
      displayValue(bondAtRetirement, bondRow.year),
    );
    const fundedYears = selected.ladderTarget
      ? bondAtRetirement / (selected.ladderTarget / getBondYears())
      : 0;
    document.getElementById('bondLadderSub').textContent =
      `${fundedYears.toFixed(1)} years of projected costs funded`;
    document.getElementById('payoffHint').textContent =
      state.tenure === 'own'
        ? selected.payoffAge === null
          ? 'Mortgage remains after the projection'
          : `Estimated payoff around age ${selected.payoffAge}`
        : '';
    if (state.tenure === 'rentThenBuy') {
      if (state.buyCash)
        document.getElementById('buyPayoffHint').textContent =
          `Purchased for cash at age ${state.buyAge}`;
      else if (selected.payoffAge === null)
        document.getElementById('buyPayoffHint').textContent =
          `Mortgage starts at age ${state.buyAge}; remains after the projection`;
      else
        document.getElementById('buyPayoffHint').textContent =
          `Mortgage starts at age ${state.buyAge}; estimated payoff around age ${selected.payoffAge}`;
    } else {
      document.getElementById('buyPayoffHint').textContent = '';
    }
    const currentInvestable = state.taxable + retirementTotal() + state.cash;
    // Both "nest egg" numbers compare liquid assets only (taxable, retirement
    // accounts, cash — never home equity) against yearly spending divided by
    // the chosen safe withdrawal rate.
    const swrPct = state.fiWithdrawalRate,
      multiple = fiMultiple(),
      multipleText = `${Number.isInteger(multiple) ? multiple : multiple.toFixed(1)}×`,
      fiNumber = selected.currentExpense * multiple,
      fireNumber = selected.retirementExpense * multiple;
    document.getElementById('fiNumber').textContent = compact(fiNumber);
    document.getElementById('fiNumberSub').textContent =
      `${fiNumber > 0 ? Math.min(999, (currentInvestable / fiNumber) * 100).toFixed(0) : 0}% funded · liquid assets only`;
    document.getElementById('fiNumberBasis').textContent =
      `FI number · ${compact(selected.currentExpense)}/yr × ${multipleText.slice(0, -1)}`;
    document.getElementById('fireNumber').textContent = compact(fireNumber);
    document.getElementById('fireNumberSub').textContent =
      `${fireNumber > 0 ? Math.min(999, (currentInvestable / fireNumber) * 100).toFixed(0) : 0}% funded · liquid assets only`;
    document.getElementById('fireNumberBasis').textContent =
      `FIRE number · ${compact(selected.retirementExpense)}/yr × ${multipleText.slice(0, -1)}`;
    const workForever = simulate(110, 110),
      crossing = workForever.rows.find((r) => r.investable >= fireNumber);
    document.getElementById('fiRetireAge').textContent = crossing
      ? `Age ${crossing.age}`
      : 'Beyond plan horizon';
    document.getElementById('fiRetireAgeSub').textContent = crossing
      ? 'first age liquid assets reach your retirement nest egg, at current savings rate'
      : 'Retirement nest egg not reached by your plan’s life expectancy at this savings rate';
    const stateTip = document.querySelector('label[for="stateTax"] .info-tip');
    if (stateTip) stateTip.dataset.tip = stateTaxTipText();
    document.getElementById('stateTaxNote').innerHTML =
      stateTaxTreatmentNote() + ' ' + STATE_TAX_NOT_MODELED_NOTE;
    document.getElementById('viewCaption').textContent =
      mode === 'real'
        ? 'Values shown in inflation-adjusted 2026 dollars.'
        : 'Future nominal dollars; expenses rise with inflation each year.';
    updateChartXAxisButtons();
    renderChartView(selected);
    renderTable(selected);
    annotateSolverRows(selected);
    annotateInheritedRows(selected);
    annotateAppealRows(selected);
    // The "More results" card is inside a shared markup region, so the summary line is added here, not in the markup.
    let planLine = document.getElementById('cliffPlanSummary');
    if (!planLine) {
      planLine = document.createElement('p');
      planLine.id = 'cliffPlanSummary';
      planLine.className = 'hint';
      planLine.style.margin = '12px 0 0';
      document.querySelector('#moreResultsCard > summary').after(planLine);
    }
    planLine.textContent = cliffPlanSummary(cliffPlanStore.plan, cliffPlanStore.report);
    renderPlanHeadline(selected);
    renderShortfallBanner(selected);
    renderUnusualAssumptions(selected);
    if (document.getElementById('sensitivityCard').open) renderTornadoChart(selected);
    const rothOptimizerCard = document.getElementById('rothOptimizerCard');
    rothOptimizerCard.hidden = !state.rothConvEnabled;
    if (state.rothConvEnabled && rothOptimizerCard.open) renderRothOptimizer(selected);
    renderMultiLeverAppliedStatus();
    if (document.getElementById('sankeyCard').open) renderSankey(selected);
    if (document.getElementById('decisionCard').open) renderDecisionQuestionPreviews();
    window.fireProjection = {
      mode,
      retirementAgeA: state.retireAgeA,
      retirementAgeB: state.retireAgeB,
      mortgagePayoffAge: selected.payoffAge,
      investableAtRetirement: displayValue(retirement.investable, retirement.year),
      netWorthAtRetirement: displayValue(retirement.total, retirement.year),
      depletedAge: selected.depletedAge,
      endAssets: displayValue(end.total, end.year),
    };
    window.fireProjectionRows = selected.rows;
    renderScenarioComparison();
    renderPlanStatusBar();
  }
