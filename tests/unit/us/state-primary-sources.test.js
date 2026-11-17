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

// One state's tax for one set of incomes, through a context built after the state is set (yearIndex 1 is tax year 2027).
async function stateTax(code, sources, filing, yearIndex = 0) {
  const w = await world();
  const { stateIncomeTax } = await w.load('us/core/tax/state-tax.js');
  await w.setState({ stateTax: code, inflation: 0 });
  w.setTaxYear(2026);
  const ctx = await w.ctx();
  const s = Object.assign({ wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] }, sources);
  return stateIncomeTax(ctx, s, filing, yearIndex);
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

it('California: the renter\'s credit reaches a California AGI of $53,994 single', async () => {
  // 2025 Form 540 booklet, Nonrefundable Renter's Credit Qualification Record, question 2: California AGI (line 17) of
  // $53,994 or less single ($107,988 joint or head of household); $60 single (line 46).
  // Single, 40, wages 53,990, rent paid. Line 18: the standard deduction $5,706; line 19: 53,990 - 5,706 = 48,284.
  // Schedule X (2025): 1% of 11,079 = 110.79; 2% of 15,185 (to 26,264) = 303.70; 4% of 15,188 (to 41,452) = 607.52;
  // 6% of 6,832 = 409.92; tax 1,431.93. Line 32: one personal exemption credit, $153. Line 46: $60. 1,431.93 - 153 - 60
  // = 1,218.93.
  const tax = await stateTax('ca', { wages: 53990, rent: 12000 }, 'single');
  near(tax, 1218.93, 'CA single at 53,990 with rent');
});

it('Delaware: the 2026 brackets are the statute\'s, 2.2% to 6.6% (HB 13 never passed)', async () => {
  // 30 Del. C. sec. 1102(a)(14), read 2026-11-16, for taxable years after 2013 (no later paragraph): nothing to $2,000,
  // 2.2% to $5,000, 3.9% to $10,000, 4.8% to $20,000, 5.2% to $25,000, 5.55% to $60,000, 6.6% above. House Bill 13 and
  // both substitutes died in the 153rd General Assembly. Standard deduction $3,250 (sec. 1108(a)); personal credit $110
  // (sec. 1110(b)).
  // Single, 40, wages 150,000: taxable 146,750. 2.2% x 3,000 = 66.00; 3.9% x 5,000 = 195.00; 4.8% x 10,000 = 480.00;
  // 5.2% x 5,000 = 260.00; 5.55% x 35,000 = 1,942.50; 6.6% x 86,750 = 5,725.50; 8,669.00 less 110 = 8,559.00.
  const tax = await stateTax('de', { wages: 150000 }, 'single');
  near(tax, 8559, 'DE single, wages 150,000');
});

it('Delaware: $2,500 more standard deduction for each filer 65 or older', async () => {
  // 30 Del. C. sec. 1108(b) and the 2025 PIT-RES instructions, line 21: $2,500 for each spouse 65 or older who takes
  // the standard deduction. Pension exclusion $12,500 per filer 60 or older (sec. 1106(b)); personal credit $110 per
  // exemption plus $110 for each filer 60 or older (sec. 1110(b)).
  // Joint, both 67, pensions 40,000 each: AGI 80,000 less 2 x 12,500 = 55,000. Deduction 6,500 + 2 x 2,500 = 11,500;
  // taxable 43,500. 2.2% x 3,000 = 66.00; 3.9% x 5,000 = 195.00; 4.8% x 10,000 = 480.00; 5.2% x 5,000 = 260.00;
  // 5.55% x 18,500 = 1,026.75; 2,027.75 less 4 x 110 = 1,587.75.
  const tax = await stateTax('de', {
    pension: 80000, pensionA: 40000, pensionB: 40000, retirementA: 0, retirementB: 0, ages: [67, 67],
  }, 'mfj');
  near(tax, 1587.75, 'DE joint, both 67, pensions 40,000 each');
});

it('Louisiana: the 2026 standard deduction and retirement exemption are the inflation-adjusted amounts', async () => {
  // La. R.S. 47:294(B) and 47:44.1 index both from 2026. Department of Revenue RIB 26-005 (2026 withholding tables):
  // standard deduction $12,875 single, $25,750 joint and head of household (the final return amounts may differ
  // slightly). Proposed rule LAC 61:I.1311 (notice of intent, 2026): retirement exemption $12,324 per filer 65 or
  // older for tax year 2026. Rate 3% (IT-540 instructions 2025, line 11).
  // Single, 40, wages 60,000: (60,000 - 12,875) x 3% = 47,125 x 3% = 1,413.75.
  near(await stateTax('la', { wages: 60000 }, 'single'), 1413.75, 'LA single, wages 60,000');
  // Single, 70, pension 30,000: 30,000 - 12,324 = 17,676; less 12,875 = 4,801; x 3% = 144.03.
  near(await stateTax('la', { pension: 30000, pensionA: 30000, pensionB: 0, retirementA: 0, retirementB: 0, ages: [70] }, 'single'), 144.03, 'LA single, 70, pension 30,000');
});

it('Louisiana: head of household takes the joint standard deduction', async () => {
  // IT-540 instructions (2025), line 8: $12,500 for filing status 1 or 3 (single, married filing separately); $25,000
  // for 2, 4 or 5 (joint, head of household, qualifying surviving spouse). RIB 26-005 gives head of household the
  // joint amount for 2026 too, $25,750.
  // Head of household, 40, one child, wages 60,000: (60,000 - 25,750) x 3% = 34,250 x 3% = 1,027.50.
  near(await stateTax('la', { wages: 60000, dependents: [kid(8)] }, 'hoh'), 1027.5, 'LA head of household, wages 60,000');
});

it('New York: the 2027 rates are 0.1 point lower in the first five brackets', async () => {
  // N.Y. Tax Law sec. 601(a)(1)(B), (b)(1)(B) and (c)(1)(B), paragraph (viii), read 2026-11-16: for taxable years after
  // 2026 and before 2033, 3.8% / 4.3% / 5.05% / 5.3% / 5.8% on the same thresholds (2026, paragraph (vii): 3.9% / 4.4%
  // / 5.15% / 5.4% / 5.9%). Standard deduction $8,000 single (sec. 614).
  // Single, 40, wages 18,000 in 2027 (projection year 1, inflation 0; New York indexes nothing): taxable 10,000.
  // 3.8% x 8,500 = 323.00; 4.3% x 1,500 = 64.50; tax 387.50.
  near(await stateTax('ny', { wages: 18000 }, 'single', 1), 387.5, 'NY single 2027, taxable 10,000');
});
