// Wiring for the Roth conversion bracket card (it renders when opened)

import { render } from './render.js';

  export function wireRothOptimizerControls() {
    document.getElementById('rothOptimizerCard').addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
  }
