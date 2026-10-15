import { chartGapPartner } from '../../shared/core/chart-prefs.js';
import { state } from '../../shared/core/store.js';

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
