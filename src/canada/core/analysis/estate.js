import { probateFee } from '../probate-fee.js';
import { currentProvince } from '../province-rules.js';
import { state } from '../../../shared/core/store.js';
import { taxIndexFactor } from '../../../shared/core/tax-index-factor.js';
import { personTaxCA } from '../federal-tax-ca.js';

  export function afterTaxEstate(sim) {
    const e = sim.estate;
    if (!e || !sim.rows.length) return 0;
    const last = sim.rows[sim.rows.length - 1],
      y = last.year,
      f = taxIndexFactor(y),
      income = last.grossIncome - 0.5 * (e.lastGains || 0), // grossIncome carries the realized gains in full; net income counts half
      own = state.singlePerson || e.survivor ? income : income / 2,
      age = Math.max(last.age, last.ageB || 0),
      gains = Math.max(0, e.taxable - e.taxableBasis),
      tax = personTaxCA(own + e.traditional, gains, y, 0, age, 0) - personTaxCA(own, 0, y, 0, age, 0),
      probate = probateFee(currentProvince().rule, (e.taxable + e.cash + e.homeEquity) / f) * f;
    return last.total - Math.max(0, tax) - probate;
  }
