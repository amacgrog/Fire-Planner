// The chart toolbar buttons: shift mode, gap partner, x-axis, and their wiring

import { chartShiftMode, chartGapPartner, assignChartXAxisMode, chartXAxisMode, assignChartGapPartner, assignChartShiftMode, lastProjectionView } from '../../../shared/core/chart-prefs.js';
import { state } from '../../../shared/core/store.js';
import { render } from '../results/render.js';
import { setChartView, setMode } from '../../../shared/ui/charts/chart-view-mode.js';

  // Syncs the Both/Gap switch's visual state only — doesn't trigger a
  // render(), so it's safe to call from inside an in-progress render pass
  // (renderChartView's own live disabled/correction check) as well as from
  // the click handlers below, which do call render() themselves afterward.
  export function updateChartShiftModeButtons() {
    document.getElementById('chartShiftTogetherBtn').classList.toggle('active', chartShiftMode === 'together');
    document.getElementById('chartShiftTogetherBtn').setAttribute('aria-checked', chartShiftMode === 'together');
    document.getElementById('chartShiftGapBtn').classList.toggle('active', chartShiftMode === 'gap');
    document.getElementById('chartShiftGapBtn').setAttribute('aria-checked', chartShiftMode === 'gap');
  }
  // Same pattern as updateChartShiftModeButtons(): visual sync only, no
  // render(), safe to call from inside an in-progress render pass. Shows
  // an explicit pick (chartGapPartner) if there is one, otherwise the
  // auto-detected earlier partner, so the two buttons always reflect
  // whichever partner would actually move right now.
  export function updateChartGapPartnerButtons() {
    const resolvedA = chartGapPartner ? chartGapPartner === 'A' : state.retireAgeA < state.retireAgeB;
    document.getElementById('chartGapPartnerABtn').classList.toggle('active', resolvedA);
    document.getElementById('chartGapPartnerABtn').setAttribute('aria-checked', resolvedA);
    document.getElementById('chartGapPartnerBBtn').classList.toggle('active', !resolvedA);
    document.getElementById('chartGapPartnerBBtn').setAttribute('aria-checked', !resolvedA);
  }
  // Visual-sync-only, safe to call mid-render. The "Partner B age" button
  // is hidden entirely in single-person mode (no second partner to switch
  // to), and chartXAxisMode is reset out of 'ageB' if the person was on it
  // when they switch to single-person mode.
  export function updateChartXAxisButtons() {
    document.getElementById('chartXAxisAgeBBtn').hidden = state.singlePerson;
    if (state.singlePerson && chartXAxisMode === 'ageB') assignChartXAxisMode('ageA');
    document.getElementById('chartXAxisAgeABtn').classList.toggle('active', chartXAxisMode === 'ageA');
    document.getElementById('chartXAxisAgeABtn').setAttribute('aria-checked', chartXAxisMode === 'ageA');
    document.getElementById('chartXAxisAgeBBtn').classList.toggle('active', chartXAxisMode === 'ageB');
    document.getElementById('chartXAxisAgeBBtn').setAttribute('aria-checked', chartXAxisMode === 'ageB');
    document.getElementById('chartXAxisYearBtn').classList.toggle('active', chartXAxisMode === 'year');
    document.getElementById('chartXAxisYearBtn').setAttribute('aria-checked', chartXAxisMode === 'year');
  }
  function setChartShiftMode(next) {
    assignChartShiftMode(next);
    updateChartShiftModeButtons();
    render();
  }
  function setChartGapPartner(next) {
    assignChartGapPartner(next);
    updateChartGapPartnerButtons();
    render();
  }
  function setChartXAxisMode(next) {
    assignChartXAxisMode(next);
    updateChartXAxisButtons();
    render();
  }
  export function wireChartControls() {
    document.getElementById('realBtn').addEventListener('click', () => setMode('real'));
    document.getElementById('nominalBtn').addEventListener('click', () => setMode('nominal'));
    document.getElementById('chartView3Btn').addEventListener('click', () => setChartView('3yr'));
    document.getElementById('chartView1Btn').addEventListener('click', () => setChartView('1yr'));
    document.getElementById('chartViewCagrBtn').addEventListener('click', () => setChartView('cagr'));
    document.getElementById('chartGroupProjectionBtn').addEventListener('click', () => setChartView(lastProjectionView));
    document.getElementById('chartGroupHistBtn').addEventListener('click', () => setChartView('hist'));
    document.getElementById('chartGroupMcBtn').addEventListener('click', () => setChartView('mc'));
    document.getElementById('chartShiftTogetherBtn').addEventListener('click', () => setChartShiftMode('together'));
    document.getElementById('chartShiftGapBtn').addEventListener('click', () => {
      if (!document.getElementById('chartShiftGapBtn').disabled) setChartShiftMode('gap');
    });
    document.getElementById('chartGapPartnerABtn').addEventListener('click', () => setChartGapPartner('A'));
    document.getElementById('chartGapPartnerBBtn').addEventListener('click', () => setChartGapPartner('B'));
    document.getElementById('chartXAxisAgeABtn').addEventListener('click', () => setChartXAxisMode('ageA'));
    document.getElementById('chartXAxisAgeBBtn').addEventListener('click', () => setChartXAxisMode('ageB'));
    document.getElementById('chartXAxisYearBtn').addEventListener('click', () => setChartXAxisMode('year'));
  }
