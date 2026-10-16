// Pushes state into the sidebar controls (the non-contribution fields)

import { isDomWired } from '../../shared/core/field-wiring.js';
import { state } from '../../shared/core/store.js';
import { syncFieldOut, syncFieldDom } from '../../shared/ui/field-dom-sync.js';
import { dynApplyVisibility, renderLoanFields } from '../../shared/ui/dynamic-lists.js';
import { refreshMoneyPreviews } from '../../shared/ui/money-format.js';
import { revealHidden } from '../core/normalize-lists.js';
import { FIELDS } from './fields.js';

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
    // Partner B's elements hide in single-person mode, and otherwise only when their own registry reveal
    // hides them (the 72(t) first-payment fields while their box is unchecked).
    document
      .querySelectorAll('[data-partner-b]')
      .forEach((el) => (el.hidden = !!state.singlePerson || revealHidden(el.id)));
    // E1c: the main job's match and premium fields hide for a self-employed partner.
    for (const id of ['matchAField', 'healthPremiumAField']) document.getElementById(id).hidden = revealHidden(id);
    // Rule of 55 needs retirement at 55 or later and does nothing from 60 (no penalty left to avoid).
    for (const p of ['A', 'B']) {
      const r = state['retireAge' + p],
        box = document.getElementById('ruleOf55' + p),
        note = document.getElementById('ruleOf55' + p + 'Note');
      box.disabled = r < 55 || r >= 60;
      note.textContent =
        r < 55 ? `Needs retirement at 55 or later (now ${r})` : r >= 60 ? 'No penalty to avoid: retires at 60 or later' : `No 10% penalty on Partner ${p}'s 401(k) withdrawals from 55 to 59½`;
    }
    document.getElementById('filingStatusFields').hidden = !!state.singlePerson;
    document.getElementById('ageAHead').textContent = state.singlePerson ? 'Age' : 'Partner A age';
    document.getElementById('ageBHead').hidden = !!state.singlePerson;
    document.getElementById('ltcLabelSuffix').textContent = state.singlePerson ? '' : ' (couple)';
    dynApplyVisibility('incomeSources');
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
    document.querySelectorAll('[data-wizard-mirror]').forEach((el) => {
      el.value = state[el.dataset.wizardMirror];
    });
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
      ['incomeKindAWagesBtn', 'wages', 'incomeKindA'],
      ['incomeKindASelfBtn', 'self', 'incomeKindA'],
      ['incomeKindBWagesBtn', 'wages', 'incomeKindB'],
      ['incomeKindBSelfBtn', 'self', 'incomeKindB'],
      ['k401TraditionalBtn', 'traditional', 'k401Type'],
      ['k401RothBtn', 'roth', 'k401Type'],
      ['iraTraditionalBtn', 'traditional', 'iraType'],
      ['iraRothBtn', 'roth', 'iraType'],
      ['pensionNoneBtn', 'none', 'pensionCoverage'],
      ['pensionABtn', 'a', 'pensionCoverage'],
      ['pensionBBtn', 'b', 'pensionCoverage'],
      ['pensionBothBtn', 'both', 'pensionCoverage'],
      ['mfjBtn', 'mfj', 'filingStatus'],
      ['singleBtn', 'single', 'filingStatus'],
    ].forEach(([id, value, key]) => {
      const el = document.getElementById(id),
        selected = state[key] === value;
      el.classList.toggle('active', selected);
      el.setAttribute('aria-checked', selected);
    });
    refreshMoneyPreviews();
  }
