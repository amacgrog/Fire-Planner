import { simulate } from '../../shared/core/monte-carlo-paths-2.js';
import { state } from '../../shared/core/store.js';
import { saveInputs } from '../../shared/ui/autosave.js';
import { syncContributionControls } from '../../shared/ui/sync-contribution-controls.js';
import { snapshotForUndo } from '../../shared/ui/undo.js';
import { optimizerState } from '../core/optimizer-state.js';
import { render } from './render.js';
import { renderMultiLeverOptimizer, renderRothPerYearOptimizer } from './roth-optimizer.js';
import { syncControls } from './sync-controls.js';

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
    snapshotForUndo('Applied optimizer schedule');
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
    // Nothing left to apply from this run once it's been applied — hide
    // the button (it reappears, freshly enabled/disabled, the next time
    // Optimize produces a result) rather than leaving it sitting there
    // inviting a redundant re-click.
    document.getElementById('multiLeverApplyBtn').hidden = true;
    document.getElementById('multiLeverApplyNote').textContent = 'Applied.';
    optimizerState.lastMultiLeverRun = null;
    syncControls();
    syncContributionControls();
    render();
    saveInputs();
  }
  export function clearAppliedMultiLeverSchedule(which) {
    snapshotForUndo('Cleared applied optimizer schedule');
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
      btn.textContent = 'Optimizing…';
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
    document.getElementById('multiLeverOptimizeBtn').addEventListener('click', (e) => {
      const options = {
        includeRoth: document.getElementById('mlRothLever').checked,
        includeMix: document.getElementById('mlMixLever').checked,
        includeSmooth: document.getElementById('mlSmoothLever').checked,
      };
      const noteEl = document.getElementById('multiLeverNoLeversNote');
      if (!options.includeRoth && !options.includeMix && !options.includeSmooth) {
        noteEl.hidden = false;
        document.getElementById('multiLeverResult').hidden = true;
        document.getElementById('multiLeverApplyBtn').hidden = true;
        document.getElementById('multiLeverApplyNote').textContent = '';
        return;
      }
      noteEl.hidden = true;
      const btn = e.target;
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Optimizing…';
      // Same paint-before-block yield as the per-year Roth optimizer above —
      // this run can cost noticeably more (up to 3 active levers × up to 5
      // structured starts × coordinate-ascent passes), so the button state
      // needs to actually be visible before the main thread blocks.
      requestAnimationFrame(() => {
        setTimeout(() => {
          renderMultiLeverOptimizer(simulate(), options);
          btn.disabled = false;
          btn.textContent = originalLabel;
        }, 0);
      });
    });
    document.getElementById('multiLeverApplyBtn').addEventListener('click', () => {
      applyMultiLeverSchedule();
    });
    document.getElementById('multiLeverAppliedStatus').addEventListener('click', (e) => {
      const which = e.target.getAttribute('data-clear-applied');
      if (which) clearAppliedMultiLeverSchedule(which);
    });
  }
