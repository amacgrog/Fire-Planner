// Controls and wiring for the Roth optimizer card and its applied schedule

import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { syncContributionControls } from '../../../shared/ui/inputs/sync-contribution-controls.js';
import { snapshotForUndo } from '../../../shared/ui/plans/undo.js';
import { render } from './render.js';
import { syncControls } from '../inputs/sync-controls.js';

  // Writes a finished multi-lever run's schedule(s) (opt, options) into state so
  // simulate() (the main projection, not just this card's own re-simulation
  // above) picks them up from now on — see appliedRothSchedule/
  // appliedMixSchedule in defaults/normalizeState and the two fallback
  // reads in solveRothConversion()/the mixCandidate line. Only touches the
  // lever(s) this run actually searched; a lever left unchecked this run
  // keeps whatever was applied (or not applied) before.
  export function applyMultiLeverSchedule(opt, options) {
    snapshotForUndo('Applied strategy schedule');
    if (options.includeRoth) {
      state.rothConvEnabled = true;
      state.appliedRothSchedule = Object.fromEntries(opt.rothSchedule);
    }
    if (options.includeMix) {
      state.appliedMixSchedule = Object.fromEntries(opt.mixSchedule);
    }
    if (options.includeSmooth) {
      state.smoothWithdrawals = opt.smoothWithdrawals;
    }
    syncControls();
    syncContributionControls();
    render();
    saveInputs();
  }
  export function clearAppliedMultiLeverSchedule(which) {
    snapshotForUndo('Cleared applied strategy schedule');
    if (which === 'roth' || which === 'both') state.appliedRothSchedule = null;
    if (which === 'mix' || which === 'both') state.appliedMixSchedule = null;
    render();
    saveInputs();
  }
  export function wireRothOptimizerControls() {
    document.getElementById('rothOptimizerCard').addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
    document.getElementById('multiLeverAppliedStatus').addEventListener('click', (e) => {
      const which = e.target.getAttribute('data-clear-applied');
      if (which) clearAppliedMultiLeverSchedule(which);
    });
  }
