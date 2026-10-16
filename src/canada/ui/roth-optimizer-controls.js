// Controls and wiring for the Roth and RRSP optimizer card

import { render } from './render.js';

  export function wireRothOptimizerControls() {
    document.getElementById('rothOptimizerCard').addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
  }
