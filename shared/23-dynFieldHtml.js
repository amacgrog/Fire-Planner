  Object.keys(DYN).forEach((name) => {
    const spec = DYN[name],
      container = document.getElementById(spec.container);
    if (!container) return;
    const apply = (el) => {
      const i = Number(el.dataset.dynI),
        f = spec.fields.find((x) => x.key === el.dataset.dynK),
        item = state[spec.key][i];
      if (!item || !f) return;
      if (f.kind === 'check') item[f.key] = el.checked;
      else if (f.kind === 'select') item[f.key] = el.value;
      else if (f.kind === 'money') item[f.key] = Number(String(el.value).replace(/[^0-9]/g, '')) || 0;
      // `blank: true`: an empty box (a number input also reports '' for partly typed invalid text) deletes the key.
      else if (f.blank && String(el.value).trim() === '') delete item[f.key];
      else {
        const n = Number(el.value) || 0;
        item[f.key] = f.int ? Math.max(0, Math.round(n)) : n;
      }
      dynApplyVisibility(name);
      render();
      saveInputs();
    };
    container.addEventListener('input', (e) => {
      if (e.target.matches('input[data-dyn-k]') && e.target.type !== 'checkbox') apply(e.target);
    });
    container.addEventListener('change', (e) => {
      if ((e.target.matches('input[data-dyn-k]') && e.target.type === 'checkbox') || e.target.matches('select[data-dyn-k]')) apply(e.target);
    });
    container.addEventListener('click', (e) => {
      const add = e.target.closest('[data-dyn-add]'),
        remove = e.target.closest('[data-dyn-remove]');
      if (add) {
        if (state[spec.key].length >= LIST_MAX) return;
        state[spec.key].push(spec.fresh());
        renderDynList(name, true);
        render();
        saveInputs();
        const rows = container.querySelectorAll('.dyn-row'),
          first = rows.length && rows[rows.length - 1].querySelector('input:not([type=checkbox])');
        if (first) first.focus();
      } else if (remove) {
        const i = Number(remove.dataset.dynRemove);
        if (!state[spec.key][i]) return;
        snapshotForUndo(`Removed ${spec.rowTitle(i).toLowerCase()}`);
        state[spec.key].splice(i, 1);
        renderDynList(name, true);
        render();
        saveInputs();
      }
    });
  });
