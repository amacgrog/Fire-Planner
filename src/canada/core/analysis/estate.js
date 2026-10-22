// After-tax estate and provincial probate fees for the Canada projection

import { currentProvince } from '../tax/province-rules.js';
import { state } from '../../../shared/core/store.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';
import { personTaxCA } from '../tax/tax.js';
import { LIVE_CTX } from '../projection/live-context.js';

  // After-tax estate (7N N8), a display figure that changes no projection. At the last death the RRSP/RRIF is income on the final
  // return and the unrealized gains of the taxable accounts are deemed realized (50% inclusion); the TFSA and the principal residence
  // are not taxed. Provincial probate fees fall on the estate that passes through probate: the taxable accounts, cash and the home
  // (registered accounts and the TFSA are assumed to pass by beneficiary designation, outside the estate; Ontario's page confirms that
  // designated RRSP, RRIF and TFSA are excluded). The final return is one person's: the deemed income is stacked on that person's share
  // of the last year's income, and the tax is the difference. Fee schedules are in today's dollars (indexed with the plan). Quebec: a
  // notarial will needs no probate (no fee); Manitoba abolished its probate charges in 2020.
  export function probateFee(rule, value) {
    const p = rule.probate;
    for (let i = 0; i < p.steps.length; i++) if (value <= p.steps[i][0]) return p.steps[i][1];
    let fee = p.base;
    for (let i = 0; i < p.bands.length; i++) {
      const from = p.bands[i][0],
        to = i + 1 < p.bands.length ? p.bands[i + 1][0] : Infinity;
      if (value > from) fee += p.bands[i][1] * Math.ceil((Math.min(value, to) - from) / 1000);
    }
    return fee;
  }
  export function afterTaxEstate(sim) {
    const e = sim.estate;
    if (!e || !sim.rows.length) return 0;
    const last = sim.rows[sim.rows.length - 1],
      y = last.year,
      f = taxIndexFactor(LIVE_CTX, y),
      income = last.grossIncome - 0.5 * (e.lastGains || 0), // grossIncome carries the realized gains in full; net income counts half
      own = state.singlePerson || e.survivor ? income : income / 2,
      age = Math.max(last.age, last.ageB || 0),
      gains = Math.max(0, e.taxable - e.taxableBasis),
      tax = personTaxCA(own + e.traditional, gains, y, 0, age, 0) - personTaxCA(own, 0, y, 0, age, 0),
      probate = probateFee(currentProvince().rule, (e.taxable + e.cash + e.homeEquity) / f) * f;
    return last.total - Math.max(0, tax) - probate;
  }
