  // Whether a real, previously-saved plan was found in this browser at
  // boot — used below to skip showing the first-run banner (there's
  // nothing "first-run" about a returning visitor whose numbers just
  // loaded back in).
  let hadSavedState = false;
  try {
    storage?.removeItem(legacyStorageKey);
    const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (saved?.state) {
      assignState(normalizeState(saved.state));
      hadSavedState = true;
    }
    if (['real', 'nominal'].includes(saved?.mode)) assignMode(saved.mode);
  } catch {}
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
  let hasPersonalizedData = hadSavedState;
  // The first-run banner flags the whole page as generic example data once,
  // but gives no lasting per-field cue once dismissed. This puts a small
  // amber marker (dot + "still the example value" tooltip) in front of the
  // label of every `ids`-driven field (every plain number/range input the
  // sidebar auto-wires — see the `ids` array) that still equals its
  // `defaults` value, so a partially-filled-in wizard or sidebar still shows
  // what's actually been personalized. Cheap enough to run on every
  // render() (a straight equality check per field, no simulation involved).
  function markDefaultFields() {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const fieldEl = el.closest('.field, .range-field');
      if (!fieldEl) return;
      const isDefault = state[id] === defaults[id];
      fieldEl.classList.toggle('is-default', isDefault);
      fieldEl.title = isDefault ? 'Still the generic example value' : '';
    });
  }
