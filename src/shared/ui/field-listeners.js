import { isDomWired } from '../core/field-wiring.js';
import { state } from '../core/store.js';
import { saveInputs } from './autosave.js';
import { syncFieldOut } from './dyn-field-html.js';
import { syncContributionControls } from './sync-contribution-controls.js';
import { FIELDS } from '#country/ui/seam-FIELDS';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  const syncFns = { controls: () => syncControls(), contrib: () => syncContributionControls() };
  export function wireFieldListeners() {
    FIELDS.filter((field) => field.type === 'number').forEach((field) => {
      const id = field.key;
      document.getElementById(id).addEventListener('input', (e) => {
        state[id] = Number(
          e.target.classList.contains('money') ? e.target.value.replace(/[^0-9]/g, '') : e.target.value,
        ) || 0;
        // A real edit un-dismisses a previously-dismissed "estimated" badge,
        // regardless of what the new value is (even if it round-trips back to
        // the default) — see the "estimated field badges" note in CLAUDE.md.
        const dismissedIdx = state.dismissedEstimates.indexOf(id);
        if (dismissedIdx !== -1) state.dismissedEstimates.splice(dismissedIdx, 1);
        if (field.onInput) field.onInput();
        if (field.inlineOut) syncFieldOut(field);
        if (field.resync) syncControls();
        render();
        saveInputs();
        if (field.syncAfter === 'contrib') syncContributionControls();
      });
    });
    FIELDS.filter(isDomWired).forEach((field) => {
      document.getElementById(field.key).addEventListener('change', (e) => {
        state[field.key] =
          field.type === 'bool' ? e.target.checked : field.valueAs === 'number' ? Number(e.target.value) : e.target.value;
        field.resync.forEach((name) => syncFns[name]());
        render();
        saveInputs();
      });
    });
  }
