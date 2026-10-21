// Pushes state into the contribution controls

import { isDomWired } from '../../core/inputs/dyn-fields.js';
import { state } from '../../core/store.js';
import { syncFieldOut, syncFieldDom } from './field-dom-sync.js';
import { renderChildFields, renderExtraExpenseFields, renderIncomeSourceFields, renderLumpExpenseFields, renderOneTimeIncomeFields, renderSpendingTierFields } from './dynamic-lists.js';
import { FIELDS } from '#country/ui/seam-FIELDS';

  export function syncContributionControls() {
    FIELDS.filter((field) => field.outSync === 'contrib').forEach(syncFieldOut);
    FIELDS.filter((field) => isDomWired(field) && field.sync === 'contrib').forEach(syncFieldDom);
    document.getElementById('survivorGroup').hidden = !!state.singlePerson;
    renderSpendingTierFields();
    renderIncomeSourceFields();
    renderOneTimeIncomeFields();
    renderExtraExpenseFields();
    renderLumpExpenseFields();
    renderChildFields();
  }
