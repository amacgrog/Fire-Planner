  loadSavedState();
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
