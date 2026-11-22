// US Social Security basis check lines under each partner's basis choice (SS claiming optimizer PR 1; the spousal part, PR 5)

import { money } from '../../../shared/core/format/numbers.js';
import { state } from '../../../shared/core/store.js';
import { fraText, ssFullRetirementAgeMonths, ssOwnFactor, ssSpousalStart } from '../../core/income/social-security.js';
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
  // The spousal part of a partner's line (SS PR 5; `alone` when there is no own line), '' when there is none: the reduced monthly
  // excess and when it starts, from the engine's own ssSpousalStart; or, with the other partner's amount at full retirement age
  // and this one's as paid at the start age (and above 0), the hint that the amount must be a PIA too for any spousal benefit
  // to count; with no own benefit beside an amount as paid at the start age, the hint to enter that one at full retirement age.
  function spousalFor(ctx, p, alone) {
    const inputs = ctx.inputs;
    if (inputs.singlePerson) return '';
    const other = p === 'A' ? 'B' : 'A',
      s = ssSpousalStart(ctx, p);
    if (s === null) {
      if (!(inputs['ssMonthly' + other] > 0)) return '';
      if (inputs['ssBenefitBasis' + other] === 'pia')
        return inputs['ssMonthly' + p] > 0 && inputs['ssBenefitBasis' + p] !== 'pia' ? `Enter this amount at full retirement age too to include any spousal benefit on Partner ${other}'s record.` : '';
      // No own benefit beside an amount as paid at the start age: the other's PIA is unknown, so no spousal benefit is counted.
      return !(inputs['ssMonthly' + p] > 0) ? `Enter Partner ${other}'s amount at full retirement age to include a spousal benefit on their record.` : '';
    }
    const age = inputs['age' + p],
      fra = ssFullRetirementAgeMonths(ctx.taxYear - age) / 12,
      when = s.x < age ? 'now' : String(s.x);
    const half = inputs['ssMonthly' + p] > 0 ? `half of Partner ${other}'s amount less your own` : `half of Partner ${other}'s amount`,
      why = `(${half}, ${s.x >= fra ? 'unreduced' : `reduced for ${s.x}`})`;
    return alone ? `Spousal benefit from ${when}: ${money(s.monthly)} a month ${why}.` : `Plus ${money(s.monthly)} a month as a spouse from ${when} ${why}.`;
  }
  export function renderSsBasisNotes() {
    const ctx = storeContext({ withPlan: false });
    for (const p of ['A', 'B']) {
      const own = noteFor(ctx, p),
        sp = spousalFor(ctx, p, own === '');
      document.getElementById('ssBasisNote' + p).textContent = sp === '' ? own : own === '' ? sp : `${own}. ${sp}`;
    }
  }
