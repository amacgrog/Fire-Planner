import { assignMode, assignState } from '../core/store.js';
import { legacyStorageKey, storage, storageKey } from './storage.js';
import { syncPanelMaxHeight } from './sync-keyboard-inset.js';
import { normalizeState } from '#country/ui/seam-normalizeState';

  // Whether a real, previously-saved plan was found in this browser at
  // boot — used below to skip showing the first-run banner (there's
  // nothing "first-run" about a returning visitor whose numbers just
  // loaded back in).
  export let hadSavedState = false;
  // Whether it's OK to actually persist `state` yet. Starts equal to
  // `hadSavedState` (a returning visitor's data is already "personalized")
  // and flips to true the moment `dismissFirstRunBanner()` runs for real —
  // i.e. the same signals that mean this isn't the generic example data
  // anymore (a real sidebar edit, opening the wizard, or importing a
  // scenario). Without this guard, `setMode(mode)` at boot would call
  // `saveInputs()` unconditionally, silently writing the untouched generic
  // example data to storage within a couple hundred milliseconds of every
  // first visit — which would then make the *next* reload look like a
  // returning visitor with "real" data, hiding the first-run banner for
  // someone who never actually entered anything.
  export let hasPersonalizedData;
  // First-run banner: the dashboard renders with fully-formed generic
  // default numbers from the moment the page loads, which reads to a
  // brand-new visitor as someone else's finished plan rather than an
  // invitation to enter their own. This banner names that explicitly and
  // points at the two real entry points (the wizard, or importing an
  // exported scenario) rather than leaving the person to notice the
  // sidebar on their own. It dismisses itself the moment its purpose is
  // served — a real edit anywhere in the sidebar, the wizard being opened
  // (intent is clear the moment they click), or a scenario actually
  // imported — rather than needing to be closed by hand. For a *returning*
  // visitor whose real plan was loaded back from this browser's storage at
  // boot, it's skipped entirely (see `hadSavedState` above) rather than
  // needing to be dismissed again on every visit.
  export function dismissFirstRunBanner() {
    document.getElementById('firstRunBanner').hidden = true;
    hasPersonalizedData = true;
    syncPanelMaxHeight();
  }
  export function loadSavedState() {
    try {
      storage?.removeItem(legacyStorageKey);
      const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
      if (saved?.state) {
        assignState(normalizeState(saved.state));
        hadSavedState = true;
      }
      if (['real', 'nominal'].includes(saved?.mode)) assignMode(saved.mode);
    } catch {}
    hasPersonalizedData = hadSavedState;
  }
  export function wireFirstRunBanner() {
    document.querySelector('.panel').addEventListener(
      'input',
      () => dismissFirstRunBanner(),
      { once: true, capture: true },
    );
    document.querySelector('.panel').addEventListener(
      'change',
      () => dismissFirstRunBanner(),
      { once: true, capture: true },
    );
    document.getElementById('firstRunGetStartedBtn').addEventListener('click', () => {
      dismissFirstRunBanner();
      document.getElementById('wizardBtn').click();
    });
    document.getElementById('firstRunImportBtn').addEventListener('click', () => {
      document.getElementById('importScenarioInput').click();
    });
  }
