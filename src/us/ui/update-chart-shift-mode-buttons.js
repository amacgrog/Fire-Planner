import { chartShiftMode } from '../../shared/core/chart-prefs.js';

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
