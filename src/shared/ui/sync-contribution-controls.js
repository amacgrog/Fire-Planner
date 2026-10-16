import { isDomWired } from '../core/field-wiring.js';
import { state } from '../core/store.js';
import { syncFieldOut } from './dyn-field-html.js';
import { renderChildFields, renderExtraExpenseFields, renderIncomeSourceFields, renderLumpExpenseFields, renderOneTimeIncomeFields, renderSpendingTierFields } from './dynamic-lists.js';
import { syncFieldDom } from './field-wiring.js';
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
