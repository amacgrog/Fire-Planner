// The note under the state selector describing how the state is taxed

import { state } from '../../shared/core/store.js';
import { STATE_RULES } from '../core/state-rules.js';

  export function stateTaxTreatmentNote() {
    const stateName = (
        document.querySelector('#stateTax option:checked')?.textContent || 'Selected state'
      ).replace(/ — .*/, ''),
      code = state.stateTax;
    const gainText =
      'Brokerage withdrawals are represented only by their modeled long-term capital-gain portion; returned cost basis is not treated as income.';
    const rule = STATE_RULES[code];
    if (rule && rule.tax.kind === 'none')
      return `<b>${stateName} state-tax treatment.</b> ${rule.notes} ${gainText}`;
    if (!rule)
      return `<b>${stateName} state-tax treatment.</b> No individual state income tax is modeled. ${gainText}`;
    if (!rule.base.ordinary)
      return `<b>${stateName} state-tax treatment.</b> Wages, Social Security, pension income, and traditional withdrawals/RMDs are not subject to a state income tax in this model. The modeled long-term capital-gain portion of brokerage withdrawals is subject to Washington's capital-gains tax only above the modeled annual exemption. ${gainText}`;
    return `<b>${stateName} state-tax treatment.</b> ${rule.notes}`;
  }
