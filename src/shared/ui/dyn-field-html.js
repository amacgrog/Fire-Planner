import { state } from '../core/store.js';

  // Writes a slider's `<key>Out` label from the current state.
  export function syncFieldOut(field) {
    document.getElementById(field.key + 'Out').textContent = field.out(state[field.key]);
  }
