import { simulate } from '../../shared/core/monte-carlo-paths-2.js';
import { renderTornadoChart } from '../../shared/ui/tornado.js';

  export function wireSensitivityLevers() {
    // Which levers are checked isn't part of `state` (it's a display choice
    // for this chart, not a plan input, so it doesn't persist across reloads
    // or get saved into exported scenarios) — just re-render the tornado chart
    // directly rather than a full render().
    document.getElementById('sensLeverToggles').addEventListener('change', () => {
      if (document.getElementById('sensitivityCard').open) renderTornadoChart(simulate());
    });
  }
