// Writes registry fields into their DOM controls (bool and choice entries)

import { state } from '../../core/store.js';

  // Writes a slider's `<key>Out` label from the current state.
  export function syncFieldOut(field) {
    document.getElementById(field.key + 'Out').textContent = field.out(state[field.key]);
  }
  // Writes one checkbox or select (and what it reveals / mirrors) from the current state.
  export function syncFieldDom(field) {
    const el = document.getElementById(field.key);
    if (field.type === 'bool') el.checked = !!state[field.key];
    else el.value = state[field.key];
    (field.reveals || []).forEach((r) => (document.getElementById(r.id).hidden = r.hidden(state)));
    (field.mirrors || []).forEach((id) => (document.getElementById(id).checked = !!state[field.key]));
  }
