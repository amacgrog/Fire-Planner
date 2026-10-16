import { state } from '../core/store.js';
import { saveInputs } from './autosave.js';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  function setTenure(tenure) {
    state.tenure = tenure;
    syncControls();
    render();
    saveInputs();
  }
  export function wireHousingButtons() {
    document.getElementById('ownBtn').addEventListener('click', () => setTenure('own'));
    document.getElementById('rentBtn').addEventListener('click', () => setTenure('rent'));
    document.getElementById('buyLaterBtn').addEventListener('click', () => setTenure('rentThenBuy'));
    document.getElementById('buyMortgageBtn').addEventListener('click', () => {
      state.buyCash = false;
      syncControls();
      render();
      saveInputs();
    });
    document.getElementById('buyCashBtn').addEventListener('click', () => {
      state.buyCash = true;
      syncControls();
      render();
      saveInputs();
    });
  }
