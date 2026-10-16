import { escapeHtml } from '../core/basics.js';
import { dynTipBtn } from '../core/dyn-field-helpers.js';
import { dynFieldHtml } from '../core/dyn-field-html.js';
import { LIST_MAX } from '../core/lists-and-children.js';
import { state } from '../core/store.js';
import { refreshMoneyPreviews } from './money-format.js';
import { DYN } from '#country/core/seam-DYN';

  export function renderDynList(name, force) {
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
  export function dynApplyVisibility(name) {
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
  export function renderLoanFields() {
    renderDynList('loans');
  }
  export function renderIncomeSourceFields() {
    renderDynList('incomeSources');
  }
  export function renderOneTimeIncomeFields() {
    renderDynList('oneTimeIncome');
  }
  export function renderExtraExpenseFields() {
    renderDynList('extraExpenses');
  }
  export function renderLumpExpenseFields() {
    renderDynList('lumpExpenses');
  }
  export function renderSpendingTierFields() {
    renderDynList('spendingTiers');
  }
  export function renderChildFields() {
    renderDynList('children');
  }
