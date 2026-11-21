// Field-spec HTML builders and growth fields for the add-as-you-go lists

import { escapeHtml, money } from '../format/numbers.js';
import { revolvingSchedule } from '../income/spending-and-loans.js';
import { LIST_NAME_MAX } from './list-titles.js';

  // ---- "Add another" lists: loans, recurring income, one-time income, ----------
  // ---- recurring expenses, one-time expenses --------------------------------
  // Each list is a plain array on `state` (starts empty) rendered by one shared
  // builder: rows of fields, an "×" per row, and a "+ Add" button. Field specs
  // below drive the markup, the parsing, and which fields show/hide. Event
  // handling is delegated on each list's container (attached once, below), so
  // rebuilding a list's innerHTML never needs to re-wire listeners.
  export function dynTipBtn(tip) {
    return `<button type="button" class="info-tip" aria-label="More info" aria-expanded="false" data-tip="${escapeHtml(tip)}">i</button>`;
  }
  // Last word + the ⓘ button share a no-wrap span so the button can never wrap
  // onto a line of its own (see "Field descriptors and info bubbles" in CLAUDE.md).
  function dynLabel(text, tip) {
    if (!tip) return escapeHtml(text);
    const m = text.match(/^(.*?)(\S+)$/);
    return `${m ? escapeHtml(m[1]) : ''}<span class="info-nw">${escapeHtml(m ? m[2] : text)}${dynTipBtn(tip)}</span>`;
  }
  export const DYN_GROWTH_FIELDS = (kind) => [
    {
      key: 'followGrowth',
      kind: 'check',
      showIf: (it) => !it.flat,
      label: kind === 'income' ? 'Grows with income growth' : 'Grows with inflation',
      short: kind === 'income' ? 'Uses your annual income growth rate' : 'Uses your inflation rate',
      tip:
        kind === 'income'
          ? 'Checked: this stream rises each year at the Annual income growth rate in the Income section. Unchecked: you set its own yearly growth rate instead — for example 0% for a fixed amount, or a rent-increase rate for rental income.'
          : 'Checked: this expense rises each year with the Inflation rate in Market assumptions (actual historical inflation in the historical backtest). Unchecked: you set its own yearly growth rate instead — for example 0% for a fixed payment, or a higher rate for something like tuition.',
    },
    {
      key: 'growth',
      kind: 'num',
      label: 'Annual growth (%)',
      short: kind === 'income' ? "This stream's own yearly rate" : "This expense's own yearly rate",
      min: -10,
      max: 20,
      step: 0.1,
      showIf: (it) => !it.flat && !it.followGrowth,
    },
  ];
  // Loan rows (feedback B3): the type select, and the fields and note of a revolving row (a credit card or a line of credit).
  // Shared by both planners' loan specs, so the tips cannot drift. A fixed-term field's showIf is `it.type !== 'revolving'`,
  // since a raw row may carry no type.
  export const DYN_LOAN_TYPE_FIELD = {
    key: 'type',
    kind: 'select',
    label: 'Type',
    options: [['amortized', 'Fixed-term loan'], ['revolving', 'Credit card or line of credit']],
    tip: "A fixed-term loan (car, student, personal) has a set payment from its original amount and term. A credit card or line of credit has no term: each month you pay the larger of the payment you choose and the card's minimum.",
  };
  export const isFixedTermLoan = (it) => it.type !== 'revolving';
  export const DYN_REVOLVING_FIELDS = [
    {
      key: 'minPct',
      kind: 'num',
      label: 'Minimum payment, %',
      short: 'Of the balance each month; often 1-3%',
      tip: "Your card's minimum payment, as a percent of the month's balance (after that month's interest). Many cards charge 1% of the balance plus the month's interest, close to 3% at a 22% APR: enter the total. A minimum below the interest never pays the card down.",
      min: 0,
      max: 100,
      step: 0.1,
      showIf: (it) => it.type === 'revolving',
    },
    { key: 'minFloor', kind: 'money', label: 'Minimum floor', short: 'The minimum is at least this, e.g. $25', step: 5, showIf: (it) => it.type === 'revolving' },
    {
      key: 'payment',
      kind: 'money',
      label: 'Monthly payment you choose',
      short: 'Whole dollars; 0 pays the minimum only',
      tip: "Each month you pay the larger of this amount and the card's minimum, never more than the balance; 0 pays the minimum only, the slowest and most costly way to clear it. The amount stays fixed in dollars (it does not rise with inflation). New charges are not modeled: count what you put on the card each month in Annual household spending, and enter here only the balance you carry.",
      step: 25,
      showIf: (it) => it.type === 'revolving',
    },
    { key: 'payoffNote', kind: 'note', text: (it) => revolvingLoanNote(it), showIf: (it) => it.type === 'revolving' },
  ];
  // The revolving row's note: when it is paid off and the interest it costs, or a warning when the first payment does not
  // cover the month's interest (the balance then never falls). { text: '' } with no balance. 100 years of months, cheap.
  // The warning's figures to the cent, so a payment just under the interest never reads as the same whole dollars.
  const cents = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // A row with no minimum and no payment says it is read as a 1% minimum (feedback B5) before the rest.
  export function revolvingLoanNote(item) {
    const r = revolvingSchedule(item, 1200);
    if (r.firstInterest === null) return { text: '', warn: false };
    const note = revolvingNoteText(r);
    return r.floored ? { ...note, text: `With no minimum and no payment, this is read as a 1% minimum. ${note.text}` } : note;
  }
  function revolvingNoteText(r) {
    if (r.firstPayment <= r.firstInterest)
      return {
        text: `The first payment (${cents(r.firstPayment)}) does not cover the month's interest (${cents(r.firstInterest)}), so the balance ${r.firstInterest > 0 ? 'grows' : 'never falls'}. Raise the payment or the minimum.`,
        warn: true,
      };
    if (r.payoffMonth === null) return { text: 'Not paid off in 100 years at this payment.', warn: false };
    const years = Math.floor(r.payoffMonth / 12),
      months = r.payoffMonth % 12,
      plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`,
      span = [years ? plural(years, 'year') : '', months ? plural(months, 'month') : ''].filter(Boolean).join(' ');
    return { text: `Paid off in ${span}, with ${money(r.totalInterest)} in interest.`, warn: false };
  }
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
    if (f.kind === 'note') {
      // A computed line, not a field (no input, so the edit handlers never match it; not a .field, so field search skips it).
      const note = f.text(item);
      return `<p class="dyn-note${note.warn ? ' warn' : ''}" data-dyn-wrap="${f.key}" data-dyn-i="${i}" data-dyn-k="${f.key}"${(f.showIf && !f.showIf(item)) || !note.text ? ' hidden' : ''}>${escapeHtml(note.text)}</p>`;
    }
    if (f.kind === 'text') {
      const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
      return `<div ${wrapAttrs}><label for="${id}">${dynLabel(f.label, f.tip)}${small}</label><input id="${id}" type="text" maxlength="${LIST_NAME_MAX}" autocomplete="off"${ph} value="${escapeHtml(item[f.key] || '')}" data-dyn-i="${i}" data-dyn-k="${f.key}"></div>`;
    }
    const money = f.kind === 'money' ? ' class="money"' : '',
      bounds = `${f.min !== undefined ? ` min="${f.min}"` : ' min="0"'}${f.max !== undefined ? ` max="${f.max}"` : ''} step="${f.step || 1}"`,
      // `blank: true` (opt-in): a missing value shows an empty box, with an optional placeholder.
      value = f.blank && item[f.key] === undefined ? '' : Number(item[f.key]) || 0,
      placeholder = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : '';
    return `<div ${wrapAttrs}><label for="${id}">${dynLabel(f.label, f.tip)}${small}</label><input id="${id}" type="number"${money}${bounds}${placeholder} value="${value}" data-dyn-i="${i}" data-dyn-k="${f.key}"></div>`;
  }
  // The row header: the row's title, then ' · ' and its name when it has one.
  export function listRowLabel(spec, item, i) {
    const name = item && typeof item.name === 'string' ? item.name.trim() : '';
    return name !== '' ? `${spec.rowTitle(i, item)} · ${name}` : spec.rowTitle(i, item);
  }
  export const isDomWired = (field) => field.type !== 'number' && !field.manual;
