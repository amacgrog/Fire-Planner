import { escapeHtml } from './basics.js';

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
  export function dynLabel(text, tip) {
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
