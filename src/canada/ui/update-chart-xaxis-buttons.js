import { assignChartXAxisMode, chartXAxisMode } from '../../shared/core/chart-prefs.js';
import { state } from '../../shared/core/store.js';

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
