// Controls and wiring for the Roth optimizer card and its applied schedule

import { simulate } from '../../../shared/core/projection/simulate.js';
import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { syncContributionControls } from '../../../shared/ui/inputs/sync-contribution-controls.js';
import { snapshotForUndo } from '../../../shared/ui/plans/undo.js';
import { optimizerState } from '../../core/optimizer-state.js';
import { render } from './render.js';
import { renderRothPerYearOptimizer } from './roth-optimizer.js';
import { syncControls } from '../inputs/sync-controls.js';

  // Writes a finished optimizeMultiLever() run's schedule(s) into state so
  // simulate() (the main projection, not just this card's own re-simulation
  // above) picks them up from now on — see appliedRothSchedule/
  // appliedMixSchedule in defaults/normalizeState and the two fallback
  // reads in solveRothConversion()/the mixCandidate line. Only touches the
  // lever(s) this run actually searched; a lever left unchecked this run
  // keeps whatever was applied (or not applied) before.
  export function applyMultiLeverSchedule() {
    if (!optimizerState.lastMultiLeverRun) return;
    const { opt, options } = optimizerState.lastMultiLeverRun;
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
    optimizerState.lastMultiLeverRun = null;
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
    // Deliberately not wired into render()/the toggle listener above — this
    // can take a few seconds on a wide ladder window (see
    // ROTH_PER_YEAR_MAX_WINDOW/ROTH_PER_YEAR_EVAL_BUDGET), so it only runs
    // when explicitly asked for, not on every render() pass or card-open.
    document.getElementById('rothPerYearOptimizeBtn').addEventListener('click', (e) => {
      const btn = e.target;
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Searching…';
      // Yield one frame so the browser actually paints the disabled/
      // "Optimizing…" state before the synchronous coordinate-ascent loop
      // blocks the main thread — without this the label swap and the
      // blocking computation land in the same paint cycle and the button
      // visually never changes until it's already done.
      requestAnimationFrame(() => {
        setTimeout(() => {
          renderRothPerYearOptimizer(simulate());
          btn.disabled = false;
          btn.textContent = originalLabel;
        }, 0);
      });
    });
    document.getElementById('multiLeverAppliedStatus').addEventListener('click', (e) => {
      const which = e.target.getAttribute('data-clear-applied');
      if (which) clearAppliedMultiLeverSchedule(which);
    });
  }
