import { FIELDS } from '../core/fields.js';
import { isDomWired } from '../../shared/core/field-wiring.js';
import { state } from '../../shared/core/store.js';
import { syncFieldOut } from '../../shared/ui/dyn-field-html.js';
import { renderLoanFields } from '../../shared/ui/dynamic-lists.js';
import { syncFieldDom } from '../../shared/ui/field-wiring.js';
import { refreshMoneyPreviews } from '../../shared/ui/money-format.js';

  export function syncControls() {
    FIELDS.forEach((field) => {
      if (field.type !== 'number') return;
      const id = field.key,
        el = document.getElementById(id);
      // Skip writing .value to whatever field is currently focused, if the
      // numeric value hasn't actually changed. syncControls() runs on every
      // edit to a field with clamping side effects (retireAgeA, extraPrincipal,
      // etc. — see the input listener below), which on mobile can include a
      // slider drag while a *different* text field is still focused (e.g. the
      // on-screen keyboard was dismissed via the Android back button, which
      // hides the keyboard without blurring the field). Programmatically
      // setting .value on a focused input — even to the same string — can
      // make some mobile browsers re-show the keyboard for it, so a slider
      // drag elsewhere was reopening the number pad on a field the user had
      // already backed out of. Comparing against the current numeric value
      // (stripping the money field's "$"/commas) keeps this a no-op guard
      // only — a field whose value genuinely needs updating still gets it.
      const currentNumeric = Number(String(el.value).replace(/[^0-9.-]/g, '')) || 0;
      if (!(el === document.activeElement && currentNumeric === state[id])) el.value = state[id];
      if (field.out && field.outSync === 'controls') syncFieldOut(field);
    });
    FIELDS.filter((field) => isDomWired(field) && field.sync === 'controls').forEach(syncFieldDom);
    renderLoanFields();
    document
      .querySelectorAll('[data-partner-b]')
      .forEach((el) => (el.hidden = !!state.singlePerson));
    document.getElementById('ageAHead').textContent = state.singlePerson ? 'Age' : 'Partner A age';
    document.getElementById('ageBHead').hidden = !!state.singlePerson;
    document.getElementById('ltcLabelSuffix').textContent = state.singlePerson ? '' : ' (couple)';
    [
      ['ownBtn', 'own'],
      ['rentBtn', 'rent'],
      ['buyLaterBtn', 'rentThenBuy'],
    ].forEach(([id, value]) => {
      const active = state.tenure === value;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    document.getElementById('homeValueFields').hidden = state.tenure === 'rent';
    document.getElementById('ownerFields').hidden = state.tenure !== 'own';
    document.getElementById('renterFieldsShared').hidden = state.tenure === 'own';
    document.getElementById('buyLaterFields').hidden = state.tenure !== 'rentThenBuy';
    // The "pay off my mortgage?" decision question only makes sense with an
    // actual current mortgage to accelerate — hide it for rent/rentThenBuy
    // rather than showing a comparison that isn't really answerable yet.
    document.querySelector('[data-question="mortgagePayoff"]').hidden = state.tenure !== 'own';
    document.getElementById('homeValueLabel').textContent =
      state.tenure === 'rentThenBuy' ? 'Home value if bought today' : 'Real estate value';
    document.getElementById('maintenanceHint').textContent =
      state.tenure === 'rentThenBuy' ? 'Applies once you buy' : 'Applies once you own';
    document.getElementById('propertyTaxHint').textContent =
      state.tenure === 'rentThenBuy'
        ? 'Applies once you buy; keeps applying after the mortgage is paid off'
        : 'Applies once you own; keeps applying after the mortgage is paid off';
    document.getElementById('homeInsuranceHint').textContent =
      state.tenure === 'rentThenBuy'
        ? 'Applies once you buy; keeps applying after the mortgage is paid off'
        : 'Applies once you own; keeps applying after the mortgage is paid off';
    document.querySelectorAll('.swr-input').forEach((el) => {
      if (document.activeElement !== el) el.value = String(state.fiWithdrawalRate);
    });
    document.getElementById('wizardAgeA').value = state.ageA;
    document.getElementById('wizardAgeB').value = state.ageB;
    document.getElementById('wizardIncomeA').value = state.incomeA;
    document.getElementById('wizardIncomeB').value = state.incomeB;
    document.getElementById('wizardRetireAgeA').value = state.retireAgeA;
    document.getElementById('wizardRetireAgeB').value = state.retireAgeB;
    document.getElementById('wizardTaxable').value = state.taxable;
    document.getElementById('wizardTraditional').value = state.traditional;
    document.getElementById('wizardRoth').value = state.roth;
    document.getElementById('wizardCash').value = state.cash;
    document.getElementById('wizardSpending').value = state.spending;
    [
      ['buyMortgageBtn', false],
      ['buyCashBtn', true],
    ].forEach(([id, value]) => {
      const active = state.buyCash === value;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    document.getElementById('buyMortgageFields').hidden = !!state.buyCash;
    [
      ['pensionNoneBtn', 'none', 'pensionCoverage'],
      ['pensionABtn', 'a', 'pensionCoverage'],
      ['pensionBBtn', 'b', 'pensionCoverage'],
      ['pensionBothBtn', 'both', 'pensionCoverage'],
    ].forEach(([id, value, key]) => {
      const el = document.getElementById(id),
        selected = state[key] === value;
      el.classList.toggle('active', selected);
      el.setAttribute('aria-checked', selected);
    });
    refreshMoneyPreviews();
  }
