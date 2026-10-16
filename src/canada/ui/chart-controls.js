import { render } from './render.js';
import { updateChartGapPartnerButtons } from './update-chart-gap-partner-buttons.js';
import { updateChartShiftModeButtons } from './update-chart-shift-mode-buttons.js';
import { updateChartXAxisButtons } from './update-chart-xaxis-buttons.js';
import { assignChartGapPartner, assignChartShiftMode, assignChartXAxisMode, lastProjectionView } from '../../shared/core/chart-prefs.js';
import { setChartView, setMode } from '../../shared/ui/chart-view-mode.js';

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
