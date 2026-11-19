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

it('Oregon: the 2026 standard deduction, exemption credit and federal tax subtraction cap', async () => {
  // Oregon Withholding Tax Formulas, 150-206-436 (Rev. 12-31-25), for 2026: standard deduction $2,910 single, $5,820
  // married; exemption credit $263; federal tax subtraction up to $8,750 below $125,000 single; brackets 4.75% to
  // $4,550, 6.75% to $11,400, 8.75% to $125,000 single.
  // Single, 40, wages 60,000, federal income tax 9,000: the subtraction is capped at 8,750. Taxable 60,000 - 8,750 -
  // 2,910 = 48,340. 4.75% x 4,550 = 216.125; 6.75% x 6,850 = 462.375; 8.75% x 36,940 = 3,232.25; 3,910.75 less the
  // $263 exemption credit = 3,647.75.
  near(await stateTax('or', { wages: 60000, federalTax: 9000 }, 'single'), 3647.75, 'OR single, wages 60,000');
});

it('Oregon: an added standard deduction for each filer 65 or older', async () => {
  // 2025 Form OR-40 instructions, line 17 (standard deduction): add $1,200 if single or head of household, or $1,000 for
  // all other filers, for each filer 65 or older (the worked example adds $1,000 for one spouse). 2026 joint figures
  // from 150-206-436: deduction $5,820, exemption credit $263, brackets 4.75% to $9,100, 6.75% to $22,800, 8.75%.
  // Joint, both 67, pensions 30,000 each, federal income tax 2,000: 60,000 - 2,000 - (5,820 + 2 x 1,000) = 50,180.
  // 4.75% x 9,100 = 432.25; 6.75% x 13,700 = 924.75; 8.75% x 27,380 = 2,395.75; 3,752.75 less 2 x 263 = 3,226.75.
  const tax = await stateTax('or', {
    pension: 60000, pensionA: 30000, pensionB: 30000, retirementA: 0, retirementB: 0, federalTax: 2000, ages: [67, 67],
  }, 'mfj');
  near(tax, 3226.75, 'OR joint, both 67, pensions 30,000 each');
});

it('DC: the child tax credit is $420 per child under 6, cut $20 per $1,000 over the threshold', async () => {
  // D.C. Code sec. 47-1806.17 (read 2026-11-16): for taxable years after 2025, $420 for each qualifying child under 6
  // at the end of the year, at most three, refundable; reduced by $20 for each $1,000 (or fraction) of AGI over $160,000
  // (single, head of household) or $240,000 (joint), not below zero. Each case is the tax with the children less the
  // tax without them, so it is the credit alone (negative).
  // Joint, wages 100,000, children 3 and 10: one child under 6, under the threshold: -420.00.
  const base = await stateTax('dc', { wages: 100000, ages: [40, 40] }, 'mfj');
  const kids = await stateTax('dc', { wages: 100000, ages: [40, 40], dependents: [kid(3), kid(10)] }, 'mfj');
  near(kids - base, -420, 'DC joint, one child under 6');
  // Single, wages 165,000, one child of 2: AGI 5,000 over $160,000, five steps of $20: 420 - 100 = 320, so -320.00.
  const b1 = await stateTax('dc', { wages: 165000 }, 'single');
  const k1 = await stateTax('dc', { wages: 165000, dependents: [kid(2)] }, 'single');
  near(k1 - b1, -320, 'DC single at 165,000, one child of 2');
});

it('Ohio: income over $26,050 owes $332 plus 2.75% of the excess', async () => {
  // R.C. 5747.02(A)(3)(c), read 2026-11-16: for taxable years from 2026, no tax on $26,050 or less; above it, $332.00
  // plus 2.75% of the amount over $26,050. Exemption $2,150 at an Ohio MAGI from $40,001 to $80,000 (2025 IT 1040 booklet).
  // Single, 40, wages 60,000: 60,000 - 2,150 = 57,850; 332 + 2.75% x 31,800 (874.50) = 1,206.50.
  near(await stateTax('oh', { wages: 60000 }, 'single'), 1206.5, 'OH single, wages 60,000');
  // At $26,050 or less, nothing: wages 28,000 less 2,400 (MAGI under $40,000; the planner uses $2,150) = 25,850, under
  // the threshold: 0.
  near(await stateTax('oh', { wages: 28000 }, 'single'), 0, 'OH single, wages 28,000');
});

it('Ohio: the joint filing credit is 20%, 15%, 10% or 5% of the tax by income less exemptions', async () => {
  // 2025 IT 1040 booklet, line 12 (read 2026-11-16): the credit is a percentage of the tax before it, at most $650, by MAGI
  // less exemptions: 20% to $25,000, 15% to $50,000, 10% to $75,000, 5% above (R.C. 5747.05(E)(1)). Exemptions $2,150 each at a MAGI from
  // $40,001 to $80,000; tax $332 plus 2.75% over $26,050 (R.C. 5747.02(A)(3)(c)).
  // Joint, both 40, wages 70,000: 70,000 - 4,300 = 65,700; 332 + 2.75% x 39,650 (1,090.375) = 1,422.375; 65,700 is in the
  // 10% band: credit 142.2375; tax 1,280.1375.
  near(await stateTax('oh', { wages: 70000, ages: [40, 40] }, 'mfj'), 1280.1375, 'OH joint, wages 70,000');
  // The band edges (V1 review): income less exemptions of 50,000 (wages 54,300): 332 + 2.75% x 23,950 (658.625) = 990.625,
  // 15% credit, 842.03125; at 50,001 the tax is 990.6525 and the credit 10%: 891.58725. At 75,000 (wages 79,300): 332 +
  // 2.75% x 48,950 (1,346.125) = 1,678.125, 10% credit, 1,510.3125; at 75,001 the tax is 1,678.1525 and the credit 5%: 1,594.244875.
  near(await stateTax('oh', { wages: 54300, ages: [40, 40] }, 'mfj'), 842.03125, 'OH joint, 50,000 less exemptions');
  near(await stateTax('oh', { wages: 54301, ages: [40, 40] }, 'mfj'), 891.58725, 'OH joint, 50,001 less exemptions');
  near(await stateTax('oh', { wages: 79300, ages: [40, 40] }, 'mfj'), 1510.3125, 'OH joint, 75,000 less exemptions');
  near(await stateTax('oh', { wages: 79301, ages: [40, 40] }, 'mfj'), 1594.244875, 'OH joint, 75,001 less exemptions');
});

it('Ohio: the senior citizen credit is $50 per return', async () => {
  // 2025 IT 1040 booklet, Schedule of Credits line 4 (R.C. 5747.055(F)): $50 per return for a filer 65 or older with MAGI
  // less exemptions under $100,000. Joint, both 67, pensions 30,000 each: 60,000 - 4,300 = 55,700; 332 + 2.75% x 29,650
  // (815.375) = 1,147.375. Credits: senior 50 (once, line 4); joint filing 10% (55,700 is in the $50,001 to $75,000 band) of
  // line 11, the tax after the line 2 to 10 credits: 10% x 1,097.375 = 109.7375; tax 987.6375.
  const tax = await stateTax('oh', { pension: 60000, pensionA: 30000, pensionB: 30000, ages: [67, 67] }, 'mfj');
  near(tax, 987.6375, 'OH joint, both 67, pensions 30,000 each');
});

it('California: the personal and dependent exemption credits are phased out and floored separately', async () => {
  // 2025 Form 540 booklet, AGI Limitation Worksheet (read 2026-11-16): over $252,203 of federal AGI (single) each exemption
  // loses $6 per $2,500 or part (line e); the personal, blind and senior credits (lines g to i) and the dependent credits
  // (lines k to m) are each floored at zero, then added (line n). $153 per personal exemption, $475 per dependent.
  // Single, wages 351,203 (99,000 over: 40 steps, $240 per exemption), one child of 5. Personal: 153 - 240, floored to 0;
  // dependent: 475 - 240 = 235. The child is worth 235.00 of credit, so the tax with the child is 235.00 lower.
  const base = await stateTax('ca', { wages: 351203 }, 'single');
  const withKid = await stateTax('ca', { wages: 351203, dependents: [kid(5)] }, 'single');
  near(withKid - base, -235, 'CA single at 351,203, one child');
});

it('DC: for 2026 to 2029 the standard deduction is the District basic amount plus the federal 65+ add-on and senior deduction', async () => {
  // D.C. Code sec. 47-1801.04(4)(A)(v) and (3A) (read 2026-11-16): for 2026 to 2029 the standard deduction is the District
  // basic standard deduction ($15,000 single, $22,500 head of household, $30,000 joint for 2025, raised by the District
  // cost-of-living adjustment from 2026; not yet published, so the 2025 amounts stand) plus the additional standard
  // deduction of IRC 63(c)(3) (2026: $1,650 per joint filer 65+, Rev. Proc. 2025-32); sec. 47-1803.04(e)(6) allows the
  // senior deduction for years after 2025 ($6,000 per filer 65+ under the $150,000 joint phase-out start). From 2030 the federal
  // standard deduction (sec. 47-1801.04(4)(A)(vi)). Rates (sec. 47-1806.03(a)(11)): 4% to $10,000, 6% to $40,000, 6.5% to
  // $60,000, 8.5% to $250,000.
  // Single, 40, wages 60,000: 60,000 - 15,000 = 45,000: 400 + 1,800 + 6.5% x 5,000 (325) = 2,525.00.
  near(await stateTax('dc', { wages: 60000 }, 'single'), 2525, 'DC single, wages 60,000');
  // Head of household, one child of 10: 60,000 - 22,500 = 37,500: 400 + 6% x 27,500 (1,650) = 2,050.00 (no child credit
  // at 10).
  near(await stateTax('dc', { wages: 60000, dependents: [kid(10)] }, 'hoh'), 2050, 'DC head of household, wages 60,000');
  // Joint, both 67, pensions 30,000 each: 60,000 - (30,000 + 2 x 1,650 + 2 x 6,000 = 45,300) = 14,700: 400 + 6% x 4,700
  // (282) = 682.00.
  near(await stateTax('dc', { pension: 60000, pensionA: 30000, pensionB: 30000, ages: [67, 67] }, 'mfj'), 682, 'DC joint, both 67');
  // 2030 (projection year 4, inflation 0): the federal standard deduction, $16,100 single: 43,900: 400 + 1,800 + 6.5% x
  // 3,900 (253.50) = 2,453.50.
  // 2029 (projection year 3) is still the District amount: 2,525.00.
  near(await stateTax('dc', { wages: 60000 }, 'single', 3), 2525, 'DC single 2029');
  near(await stateTax('dc', { wages: 60000 }, 'single', 4), 2453.5, 'DC single 2030');
});

it('Ohio: from 2026 no exemptions and no joint filing credit at a modified AGI of $500,000 or more', async () => {
  // R.C. 5747.025 and 5747.05(E)(2) (read 2026-11-17): the personal and dependent exemptions, and the joint filing credit,
  // need a modified AGI under $750,000 for 2025 and under $500,000 for taxable years from 2026. Ohio MAGI is the Ohio AGI
  // plus the business income deduction (none here).
  // Joint, both 40, wages 600,000: no exemptions and no credit: 332 + 2.75% x 573,950 (15,783.625) = 16,115.625.
  near(await stateTax('oh', { wages: 600000, ages: [40, 40] }, 'mfj'), 16115.625, 'OH joint, wages 600,000');
  // A child adds no exemption either: 16,115.625.
  near(await stateTax('oh', { wages: 600000, ages: [40, 40], dependents: [kid(5)] }, 'mfj'), 16115.625, 'OH joint, 600,000, a child');
  // At exactly 500,000 none: 332 + 2.75% x 473,950 (13,033.625) = 13,365.625.
  near(await stateTax('oh', { wages: 500000, ages: [40, 40] }, 'mfj'), 13365.625, 'OH joint, wages 500,000');
  // At 499,999 both apply: 499,999 - 4,300 = 495,699; 332 + 2.75% x 469,649 (12,915.3475) = 13,247.3475; the 5% credit
  // (662.367375) is capped at $650: 12,597.3475.
  near(await stateTax('oh', { wages: 499999, ages: [40, 40] }, 'mfj'), 12597.3475, 'OH joint, wages 499,999');
});

it('Ohio: a qualifying surviving spouse files in the single column, with no joint filing credit', async () => {
  // Ohio IT 1040 has one filing status for single, head of household or qualifying surviving spouse, and the joint filing
  // credit needs a joint return of husband and wife (R.C. 5747.05(E)(1)). Survivor, 40, wages 60,000, a child of 5: one
  // filer exemption 2,150 and the child's 2,150 (MAGI $40,001 to $80,000): 60,000 - 4,300 = 55,700; 332 + 2.75% x 29,650
  // (815.375) = 1,147.375; no credit.
  near(await stateTax('oh', { wages: 60000, dependents: [kid(5)] }, 'qss'), 1147.375, 'OH qualifying surviving spouse');
});

it('DC: the senior deduction phases out on the federal modified AGI, Social Security included', async () => {
  // IRC 151(f) (OBBBA sec. 70103): $6,000 per filer 65+, less 6% of the modified AGI over $150,000 joint. DC exempts Social
  // Security from its own income, but the federal phase-out still counts the taxable benefits.
  // Joint, both 67, pensions 140,000 (70,000 each), taxable Social Security 40,000: federal MAGI 180,000, 30,000 over:
  // 6,000 - 1,800 = 4,200 each. Deduction 30,000 + 2 x 1,650 + 2 x 4,200 = 41,700; taxable 140,000 - 41,700 = 98,300:
  // 400 + 1,800 + 1,300 + 8.5% x 38,300 (3,255.50) = 6,755.50.
  const tax = await stateTax('dc', { pension: 140000, pensionA: 70000, pensionB: 70000, taxableSS: 40000, ages: [67, 67] }, 'mfj');
  near(tax, 6755.5, 'DC joint, both 67, pensions and Social Security');
});
