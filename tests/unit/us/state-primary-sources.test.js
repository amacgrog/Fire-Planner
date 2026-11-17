// State rule figures corrected against the state's own forms (validation track V1, 2026-11-16).
//
// Each case runs one real STATE_RULES row for tax year 2026 at projection year 0 (inflation 0, so the 2026 figures
// apply as published) and compares stateIncomeTax with a figure worked by hand from the form lines cited beside it.
// The expected values are hand-computed literals, never engine output; the tolerance is half a cent, written out.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const near = (a, b, label) => {
  expect(Math.abs(a - b) <= 0.005, label + ': expected ' + b + ', got ' + a).toBe(true);
};

// One state's tax for one set of incomes, through a context built after the state is set.
async function stateTax(code, sources, filing) {
  const w = await world();
  const { stateIncomeTax } = await w.load('us/core/tax/state-tax.js');
  await w.setState({ stateTax: code, inflation: 0 });
  w.setTaxYear(2026);
  const ctx = await w.ctx();
  const s = Object.assign({ wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] }, sources);
  return stateIncomeTax(ctx, s, filing, 0);
}

const kid = (age) => ({ age, student: false, qualifyingChild: true });

it('Arizona: a child gets the dependent tax credit, not a $2,300 exemption', async () => {
  // Arizona Form 140 instructions (2025): line 40 "Other Exemptions" ($2,300) is only for a person 65 or over whose
  // care costs the filer pays, or a stillborn child, and a person claimed there cannot be claimed for the line 49
  // dependent tax credit. A child gets the line 49 credit only: $100 under 17.
  // Joint, both 40, wages 100,000, children 5 and 10. Line 43: the federal standard deduction, 2026 $32,200.
  // Line 45: 100,000 - 32,200 = 67,800. Line 46: 67,800 x 2.5% = 1,695.00. Line 49: 2 x $100 = 200. Tax 1,495.00.
  const tax = await stateTax('az', { wages: 100000, ages: [40, 40], dependents: [kid(5), kid(10)] }, 'mfj');
  near(tax, 1495, 'AZ joint, two children');
});
