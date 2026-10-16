import { mode, state } from '../core/store.js';
import { hasPersonalizedData } from './saved-plan.js';
import { storage, storageKey } from './storage.js';

  // Autosaves `state`/`mode` to this browser's localStorage (never sent
  // anywhere — see the README's privacy note) so a reload or a later visit
  // comes back to real numbers instead of the generic example data.
  // Debounced (250ms idle) since saveInputs() is called on nearly every
  // keystroke via the `ids` input listener; `writeStorageNow()` is also
  // flushed unconditionally on `pagehide` so the very last edit before a
  // tab close/reload is never lost to a pending debounce timer.
  function writeStorageNow() {
    const statusEl = document.getElementById('saveStatus');
    if (!hasPersonalizedData) return;
    if (!storage) {
      if (statusEl) statusEl.textContent = 'Not autosaved — storage unavailable';
      return;
    }
    try {
      storage.setItem(storageKey, JSON.stringify({ state, mode }));
      if (statusEl) statusEl.textContent = 'Plan autosaved in this browser';
    } catch {
      if (statusEl) statusEl.textContent = 'Not autosaved — storage full or unavailable';
    }
  }
  let saveDebounceTimer = null;
  export function saveInputs() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(writeStorageNow, 250);
  }
  export function wireAutosave() {
    window.addEventListener('pagehide', writeStorageNow);
  }
