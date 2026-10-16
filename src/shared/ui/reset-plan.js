// Wires the reset button

import { assignLogScale } from '../core/chart-prefs.js';
import { assignMode, assignState } from '../core/store.js';
import { setMcPathCount } from './chart-toolbar.js';
import { setChartView, setMode } from './chart-view-mode.js';
import { syncContributionControls } from './sync-contribution-controls.js';
import { snapshotForUndo } from './undo.js';
import { defaults } from '#country/core/seam-defaults';
import { syncControls } from '#country/ui/seam-syncControls';

  export function wireResetButton() {
    document.getElementById('resetBtn').addEventListener('click', () => {
      if (
        !confirm(
          "Reset all inputs to the generic example data? This clears what's saved in this browser and can't be undone — export a scenario first if you want to keep what you've entered.",
        )
      )
        return;
      snapshotForUndo('Reset to example data');
      assignState({
        ...defaults,
        loans: defaults.loans.map((l) => ({ ...l })),
        spendingTiers: defaults.spendingTiers.map((t) => ({ ...t })),
        incomeSources: defaults.incomeSources.map((t) => ({ ...t })),
        oneTimeIncome: defaults.oneTimeIncome.map((t) => ({ ...t })),
        extraExpenses: defaults.extraExpenses.map((t) => ({ ...t })),
        lumpExpenses: defaults.lumpExpenses.map((t) => ({ ...t })),
        children: defaults.children.map((t) => ({ ...t })),
      });
      assignMode('real');
      assignLogScale(false);
      document.getElementById('logScaleToggle').checked = false;
      setMcPathCount(1000);
      syncControls();
      syncContributionControls();
      setMode('real');
      setChartView('3yr');
    });
  }
