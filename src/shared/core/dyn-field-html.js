import { escapeHtml } from './basics.js';
import { dynLabel } from './dyn-field-helpers.js';

  export function dynFieldHtml(spec, f, item, i) {
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
