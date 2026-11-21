// US Social Security basis check lines under each partner's basis choice (SS claiming optimizer PR 1)

import { money } from '../../../shared/core/format/numbers.js';
import { state } from '../../../shared/core/store.js';
import { fraText, ssFullRetirementAgeMonths, ssOwnFactor } from '../../core/income/social-security.js';
import { storeContext } from '../../core/projection/store-context.js';

  // A factor as a percent, one decimal, a trailing ".0" dropped (70%, 86.7%, 124%).
  export const pctText = (f) => String(Math.round(f * 1000) / 10) + '%';
  // One partner's line, '' in the start-age basis (or for Partner B in a single-person plan): when the benefit is paid from, the
  // monthly amount it pays in today's dollars (no benefit cut: the cut has its own field) and its share of the amount at full
  // retirement age. The factor is the engine's own (ssOwnFactor), and the paid-from age follows the same rules.
  function noteFor(ctx, p) {
    const inputs = ctx.inputs;
    if (p === 'B' && inputs.singlePerson) return '';
    if (inputs['ssBenefitBasis' + p] !== 'pia') return '';
    const start = inputs['ssStartAge' + p],
      age = inputs['age' + p],
      f = ssOwnFactor(ctx, p),
      fra = ssFullRetirementAgeMonths(ctx.taxYear - age) / 12,
      tail = `${money(inputs['ssMonthly' + p] * f)} a month, ${pctText(f)} of your amount at full retirement age (${fraText(fra)})`;
    if (start > age) return `Starts at ${start}: ${tail}`;
    if (inputs['ssCollecting' + p] === true) return `Collecting since ${start}: ${tail}`;
    if (start === age) return `Paid from ${start}: ${tail}`;
    return age < 62 ? `Paid from ${age}, at the factor of 62: ${tail}` : `Claims now, at ${age}: ${tail}`;
  }
  export function renderSsBasisNotes() {
    const ctx = storeContext({ withPlan: false });
    for (const p of ['A', 'B']) document.getElementById('ssBasisNote' + p).textContent = noteFor(ctx, p);
  }
