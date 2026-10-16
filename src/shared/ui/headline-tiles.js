// The dashboard headline tiles and their safe-withdrawal-rate boxes

import { state } from '../core/store.js';
import { saveInputs } from './autosave.js';
import { render } from '#country/ui/seam-render';

  export function wireHeadlineTiles() {
    // Stack the four headline tiles 2x2 as soon as they would get cramped (a
    // width-based check on the tiles' own row, not the window, because the
    // sidebar eats a variable share of the viewport).
    (() => {
      const row = document.querySelector('.metrics-primary');
      if (!row || !window.ResizeObserver) return;
      new ResizeObserver(() => row.classList.toggle('two-col', row.getBoundingClientRect().width < 1000)).observe(row);
    })();
    // Safe-withdrawal-rate boxes on the FI / retirement-number tiles: two inputs,
    // one state value (state.fiWithdrawalRate), kept in sync by syncControls().
    document.querySelectorAll('.swr-input').forEach((input) => {
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v) || v < 0.5 || v > 15) return;
        state.fiWithdrawalRate = v;
        document.querySelectorAll('.swr-input').forEach((o) => {
          if (o !== input) o.value = String(v);
        });
        render();
        saveInputs();
      });
      input.addEventListener('blur', () => {
        input.value = String(state.fiWithdrawalRate);
      });
    });
  }
