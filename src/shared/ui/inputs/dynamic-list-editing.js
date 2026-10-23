// Add, remove and edit handlers for the add-as-you-go lists

import { LIST_MAX } from '../../core/inputs/lists.js';
import { state } from '../../core/store.js';
import { saveInputs } from '../plans/autosave.js';
import { dynApplyVisibility, renderDynList } from './dynamic-lists.js';
import { snapshotForUndo } from '../plans/undo.js';
import { flushRender, scheduleRender } from '../results/render-scheduler.js';
import { DYN } from '#country/core/seam-DYN';
import { render } from '#country/ui/seam-render';

  export function wireDynamicListEditing() {
    Object.keys(DYN).forEach((name) => {
      const spec = DYN[name],
        container = document.getElementById(spec.container);
      if (!container) return;
      // `typed`: a text or number box's `input` event, which renders through scheduleRender (its `change` flushes).
      const apply = (el, typed) => {
        const i = Number(el.dataset.dynI),
          f = spec.fields.find((x) => x.key === el.dataset.dynK),
          item = state[spec.key][i];
        if (!item || !f) return;
        if (f.kind === 'check') item[f.key] = el.checked;
        else if (f.kind === 'select') item[f.key] = el.value;
        else if (f.kind === 'money') item[f.key] = Number(String(el.value).replace(/[^0-9]/g, '')) || 0;
        // `blank: true`: an empty box (a number input also reports '' for partly typed invalid text) deletes the key.
        else if (f.blank && String(el.value).trim() === '') delete item[f.key];
        else {
          const n = Number(el.value) || 0;
          item[f.key] = f.int ? Math.max(0, Math.round(n)) : n;
        }
        dynApplyVisibility(name);
        if (typed) scheduleRender();
        else render();
        saveInputs();
      };
      container.addEventListener('input', (e) => {
        if (e.target.matches('input[data-dyn-k]') && e.target.type !== 'checkbox') apply(e.target, true);
      });
      container.addEventListener('change', (e) => {
        if ((e.target.matches('input[data-dyn-k]') && e.target.type === 'checkbox') || e.target.matches('select[data-dyn-k]')) apply(e.target);
        else if (e.target.matches('input[data-dyn-k]')) flushRender();
      });
      container.addEventListener('click', (e) => {
        const add = e.target.closest('[data-dyn-add]'),
          remove = e.target.closest('[data-dyn-remove]');
        if (add) {
          if (state[spec.key].length >= LIST_MAX) return;
          state[spec.key].push(spec.fresh());
          renderDynList(name, true);
          render();
          saveInputs();
          const rows = container.querySelectorAll('.dyn-row'),
            first = rows.length && rows[rows.length - 1].querySelector('input:not([type=checkbox])');
          if (first) first.focus();
        } else if (remove) {
          const i = Number(remove.dataset.dynRemove);
          if (!state[spec.key][i]) return;
          snapshotForUndo(`Removed ${spec.rowTitle(i).toLowerCase()}`);
          state[spec.key].splice(i, 1);
          renderDynList(name, true);
          render();
          saveInputs();
        }
      });
    });
  }
