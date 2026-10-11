  function dynFieldHtml(spec, f, item, i) {
    const id = `${spec.prefix}${i}${f.key[0].toUpperCase()}${f.key.slice(1)}`,
      small = f.short ? `<small>${escapeHtml(f.short)}</small>` : '',
      wrapAttrs = `class="field" data-dyn-wrap="${f.key}"${f.showIf && !f.showIf(item) ? ' hidden' : ''}`;
    if (f.kind === 'check') {
      return `<div ${wrapAttrs}><label for="${id}"><input id="${id}" type="checkbox" data-dyn-i="${i}" data-dyn-k="${f.key}" ${item[f.key] ? 'checked' : ''}> ${dynLabel(f.label, f.tip)}${small}</label></div>`;
    }
    if (f.kind === 'select') {
      const opts = f.options
        .map(([v, l]) => `<option value="${escapeHtml(v)}"${String(item[f.key]) === v ? ' selected' : ''}>${escapeHtml(l)}</option>`)
        .join('');
      return `<div ${wrapAttrs}><label for="${id}">${dynLabel(f.label, f.tip)}${small}</label><select id="${id}" data-dyn-i="${i}" data-dyn-k="${f.key}">${opts}</select></div>`;
    }
    const money = f.kind === 'money' ? ' class="money"' : '',
      bounds = `${f.min !== undefined ? ` min="${f.min}"` : ' min="0"'}${f.max !== undefined ? ` max="${f.max}"` : ''} step="${f.step || 1}"`,
      // `blank: true` (opt-in): a missing value shows an empty box, with an optional placeholder.
      value = f.blank && item[f.key] === undefined ? '' : Number(item[f.key]) || 0,
      placeholder = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div ${wrapAttrs}><label for="${id}">${dynLabel(f.label, f.tip)}${small}</label><input id="${id}" type="number"${money}${bounds}${placeholder} value="${value}" data-dyn-i="${i}" data-dyn-k="${f.key}"></div>`;
  }
  function renderDynList(name, force) {
    const spec = DYN[name],
      container = document.getElementById(spec.container),
      items = state[spec.key];
    if (!container) return;
    // Skip a rebuild while someone is typing inside this list (it would drop
    // focus/caret on every keystroke) as long as the row count hasn't changed;
    // show/hide of dependent fields is handled in place by dynApplyVisibility().
    if (!force && container.contains(document.activeElement) && container.dataset.rowCount === String(items.length)) {
      dynApplyVisibility(name);
      return;
    }
    container.dataset.rowCount = String(items.length);
    const rows = items
      .map(
        (item, i) =>
          `<div class="dyn-row"><div class="dyn-row-head"><b>${escapeHtml(spec.rowTitle(i))}</b><button type="button" class="dyn-remove" data-dyn-remove="${i}" aria-label="Remove ${escapeHtml(spec.rowTitle(i).toLowerCase())}" title="Remove">×</button></div>${spec.fields.map((f) => dynFieldHtml(spec, f, item, i)).join('')}</div>`,
      )
      .join('');
    const full = items.length >= LIST_MAX;
    container.innerHTML =
      `<p class="range-note">${escapeHtml(spec.note)}${dynTipBtn(spec.tip)}</p>` +
      (items.length ? rows : '<p class="dyn-empty">None added yet.</p>') +
      `<button type="button" class="btn-card dyn-add" data-dyn-add="${name}"${full ? ' disabled title="Up to ' + LIST_MAX + '"' : ''}>${escapeHtml(spec.addLabel)}</button>`;
    refreshMoneyPreviews(container);
  }
  function dynApplyVisibility(name) {
    const spec = DYN[name],
      container = document.getElementById(spec.container);
    if (!container) return;
    state[spec.key].forEach((item, i) =>
      spec.fields.forEach((f) => {
        if (!f.showIf) return;
        const input = container.querySelector(`[data-dyn-i="${i}"][data-dyn-k="${f.key}"]`),
          wrap = input && input.closest('[data-dyn-wrap]');
        if (wrap) wrap.hidden = !f.showIf(item);
      }),
    );
  }
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
  function renderLoanFields() {
    renderDynList('loans');
  }
  function renderIncomeSourceFields() {
    renderDynList('incomeSources');
  }
  function renderOneTimeIncomeFields() {
    renderDynList('oneTimeIncome');
  }
  function renderExtraExpenseFields() {
    renderDynList('extraExpenses');
  }
  function renderLumpExpenseFields() {
    renderDynList('lumpExpenses');
  }
  function renderSpendingTierFields() {
    renderDynList('spendingTiers');
  }
  function renderChildFields() {
    renderDynList('children');
  }
  // Writes a slider's `<key>Out` label from the current state.
  function syncFieldOut(field) {
    document.getElementById(field.key + 'Out').textContent = field.out(state[field.key]);
  }
