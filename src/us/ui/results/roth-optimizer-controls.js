// Wiring for the Roth conversion bracket card (it renders when opened) and its "No conversions" suggestion's field link

import { render } from './render.js';
import { revealField } from '../../../shared/ui/inputs/estimate-review.js';

  export function wireRothOptimizerControls() {
    document.getElementById('rothOptimizerCard').addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
    // The "No conversions" suggestion's link shows the sidebar checkbox (the card has no Apply: the user changes the setting).
    document.getElementById('rothOptimizerSummary').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-reveal-field]');
      if (btn) revealField(btn.dataset.revealField);
    });
  }
