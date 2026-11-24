// Wiring for the bond reserve start buttons (build before retirement / start with it held)

import { state } from '../../core/store.js';
import { saveInputs } from '../plans/autosave.js';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

function setBondStart(value) {
  state.bondStart = value;
  syncControls();
  render();
  saveInputs();
}

export function wireBondStartButtons() {
  document.getElementById('bondBuildBtn').addEventListener('click', () => setBondStart('build'));
  document.getElementById('bondHeldBtn').addEventListener('click', () => setBondStart('held'));
}
