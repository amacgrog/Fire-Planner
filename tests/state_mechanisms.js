// State income tax mechanisms (US, Batch 7C), each exercised on a synthetic jurisdiction 'zz' that
// the test adds to STATE_RULES, so the arithmetic is isolated from any real state's figures. Every
// expected value is worked by hand in the comment beside it. The real reference states are covered
// in tests/state_reference.js.
//
// The synthetic row is a flat 10% tax with no deduction; each case switches on one mechanism.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const R = t.STATE_RULES;
  const fails = [];
  const near = (a, b, label) => { if (!(Math.abs(a - b) <= 0.005)) fails.push(label + ': expected ' + b + ', got ' + a); };
  st.inflation = 0;
  st.stateTax = 'zz';
  const zero3 = { single: 0, mfj: 0, hoh: 0 };
  const idx = (on, o) => Object.assign({ bracketsIndexed: on, standardDeductionIndexed: on, personalExemptionIndexed: on, creditAmountsIndexed: on, creditThresholdsIndexed: on, retirementExclusionIndexed: on }, o);
  const flat = (rate) => ({ kind: 'flat', rate });
  const mk = (o) => Object.assign({
    name: 'Synthetic', status: 'migrated', sourceKind: 'none', source: null, asOf: null, indexing: idx(false),
    statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, tax: flat(0.1), additions: [],
    base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
    standardDeduction: { ...zero3 }, standardDeductionPhase: { kind: 'none' }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
    seniorExemption: { kind: 'none' }, federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false }, schedule: [],
    retirementExclusion: { kind: 'none' }, credits: [], federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
  }, o);
  // The compiled row is cached per code, so each case registers a fresh code.
  let n = 0;
  const run = (row, sources, filing = 'single', yearIndex = 0) => {
    const code = 'zz' + n++;
    R[code] = mk(row);
    st.stateTax = code;
    const s = Object.assign({ wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] }, sources);
    const out = t.stateIncomeTax(s, filing, yearIndex);
    delete R[code];
    return out;
  };
  const kid = (age, o) => Object.assign({ age, student: false, qualifyingChild: true }, o);
  const cols = (v) => ({ single: v, mfj: v, hoh: v });

  // --- Benefit recapture (NY-style) ------------------------------------------------------------------
  // Brackets: 4% to 10,000, 5% to 20,000, 6% above. Recapture from AGI 12,000 over 4,000 of AGI; bands: below
  // 20,000 taxable the flat 5%, above it 6%; everything at 7% once AGI is over 1,000,000.
  const recap = {
    tax: { kind: 'graduated', columns: { single: [[0, 0.04], [10000, 0.05], [20000, 0.06]], mfj: [[0, 0.04], [10000, 0.05], [20000, 0.06]], hoh: [[0, 0.04], [10000, 0.05], [20000, 0.06]] } },
    additions: [{ kind: 'benefitRecapture', indexed: false, agiStart: 12000, phaseWidth: 4000, flatAbove: 1000000, flatRate: 0.07, tiers: { single: [[0, 0.05], [20000, 0.06]], mfj: [[0, 0.05], [20000, 0.06]], hoh: [[0, 0.05], [20000, 0.06]] } }],
  };
  near(run(recap, { wages: 11000 }), 400 + 5 * 10, 'recapture: AGI under the start owes the plain tax (11,000: 400 + 50)'); // 400 + 1,000 x 5% = 450
  // AGI 15,000: tax 400 + 250 = 650; flat 5% = 750; ratio (15,000 - 12,000) / 4,000 = 0.75 -> 650 + 100 x 0.75 = 725
  near(run(recap, { wages: 15000 }), 725, 'recapture: first band, three quarters phased in');
  // AGI 18,000: tax 400 + 400 = 800; flat 5% = 900; ratio 1 -> 900
  near(run(recap, { wages: 18000 }), 900, 'recapture: first band, fully phased in is the flat rate on everything');
  // AGI 30,000 (taxable 30,000): tax 400 + 500 + 600 = 1,500; band 6% from 20,000 (previous rate 5%): base 0.05 x 20,000 - 900 = 100,
  // incremental (0.06 - 0.05) x 20,000 = 200; ratio (30,000 - 20,000) / 4,000 -> 1; 1,500 + 100 + 200 = 1,800 = 6% x 30,000
  near(run(recap, { wages: 30000 }), 1800, 'recapture: second band, fully phased in is 6% of everything');
  // AGI 21,000 (taxable 21,000): tax 400 + 500 + 60 = 960; ratio (21,000 - 20,000) / 4,000 = 0.25 -> 960 + 100 + 200 x 0.25 = 1,110
  near(run(recap, { wages: 21000 }), 1110, 'recapture: second band, a quarter of the incremental benefit');
  // A deduction lowers taxable income but the AGI that drives the phase-in is before it: AGI 30,000, deduction 10,000
  // -> taxable 20,000 (first band): 900 + (0.05 x 20,000 - 900) = 1,000
  near(run({ ...recap, standardDeduction: cols(10000) }, { wages: 30000 }), 1000, 'recapture: phase-in follows AGI, band follows taxable income');
  near(run(recap, { wages: 2000000 }), 140000, 'recapture: AGI over the flat threshold is 7% of everything');

  // --- AGI step addition (CT-style add-back) -----------------------------------------------------------
  const step = { tax: flat(0.1), additions: [{ kind: 'agiStep', indexed: false, label: 'add-back', tables: cols([[0, 0], [50000, 25], [60000, 50]]) }] };
  near(run(step, { wages: 50000 }), 5000, 'agi step: at the bound is not over it');
  near(run(step, { wages: 55000 }), 5525, 'agi step: 5,500 + 25');
  near(run(step, { wages: 70000 }), 7050, 'agi step: 7,000 + 50');

  // --- Exemption credits with a phase-out (CA-style) ----------------------------------------------------
  const exc = (extra) => Object.assign({
    credits: [{ kind: 'exemptionCredits', label: 'exemption credits', refundable: false, personal: { single: 100, mfj: 200, hoh: 100 }, personalCount: { single: 1, mfj: 2, hoh: 1 }, senior: { age: 65, amount: 100 }, dependent: 300, phaseOut: { start: cols(50000), width: 2500, reduction: 6 } }],
  }, extra);
  near(run(exc(), { wages: 40000, ages: [40] }), 4000 - 100, 'exemption credits: personal only');
  near(run(exc(), { wages: 40000, ages: [66] }), 4000 - 200, 'exemption credits: personal + senior');
  near(run(exc(), { wages: 40000, ages: [40], dependents: [kid(5), kid(20, { qualifyingChild: false })] }), 4000 - 400, 'exemption credits: one qualifying dependent');
  // Federal AGI 60,000: over by 10,000 = 4 steps; two credits (personal + senior) lose 6 x 4 each = 48 -> 200 - 48 = 152
  near(run(exc(), { wages: 60000, ages: [66] }), 6000 - 152, 'exemption credits: phase-out of 6 per 2,500 on each credit');
  near(run(exc(), { wages: 60001, ages: [40] }), 6000.1 - (100 - 6 * 5), 'exemption credits: a partial step counts as a full one (60,001 -> 5 steps)');
  near(run(exc(), { wages: 100000, ages: [40] }), 10000, 'exemption credits: phased out entirely never goes negative (20 steps x 6 = 120 > 100)');
  near(run(exc(), { wages: 40000, ages: [40, 40] }, 'mfj'), 4000 - 200, 'exemption credits: joint personal amount');

  // --- Renter credit ---------------------------------------------------------------------------------------
  const rent = { credits: [{ kind: 'renterCredit', label: 'renter', refundable: false, amount: { single: 60, mfj: 120, hoh: 120 }, agiLimit: cols(50000) }] };
  near(run(rent, { wages: 40000, rent: 12000 }), 4000 - 60, 'renter credit: renter under the limit');
  near(run(rent, { wages: 40000, rent: 0 }), 4000, 'renter credit: an owner gets none');
  near(run(rent, { wages: 50000, rent: 12000 }), 5000 - 60, 'renter credit: at the limit still counts');
  near(run(rent, { wages: 50001, rent: 12000 }), 5000.1, 'renter credit: over the limit loses all of it');
  near(run(rent, { wages: 40000, rent: 12000 }, 'mfj'), 4000 - 120, 'renter credit: joint amount');

  // --- Child credit by age, refundable, with a phase-out (NY-style) --------------------------------------
  const child = { credits: [{ kind: 'childCredit', label: 'child', refundable: true, tiers: [[3, 1000], [16, 500]], phaseOut: { start: cols(75000), width: 1000, per: 16.5 } }] };
  const kids = [kid(2), kid(10), kid(17), kid(4, { qualifyingChild: false })];
  // Under the threshold: 1,000 (age 2) + 500 (age 10); the 17-year-old is over the top tier and the unqualified child is skipped.
  near(run(child, { wages: 40000, dependents: kids }), 4000 - 1500, 'child credit: by age, qualifying children only');
  // Federal AGI 90,000: over by 15,000 = 15 steps x 16.50 = 247.50 off the household total of 1,500 -> 1,252.50
  near(run(child, { wages: 90000, dependents: kids }), 9000 - 1252.5, 'child credit: the phase-out comes off the total');
  // One 500 credit and AGI 100,000 (over by 25,000 = 25 steps = 412.50): 87.50 left; two of them (1,000): 587.50
  near(run(child, { wages: 100000, dependents: [kid(8)] }), 10000 - 87.5, 'child credit: one child');
  near(run(child, { wages: 100000, dependents: [kid(8), kid(9)] }), 10000 - 587.5, 'child credit: two children share one phase-out');
  // Tax 500 on 5,000 of wages, credit 1,500 (refundable): the state tax goes negative.
  near(run(child, { wages: 5000, dependents: kids }), 500 - 1500, 'child credit: refundable credit can take the tax below zero');

  // --- Property tax credit (CT-style) ----------------------------------------------------------------------
  const prop = { credits: [{ kind: 'propertyTaxCredit', label: 'property tax', refundable: false, max: 300, limit: cols(50000), stepWidth: 10000, stepPct: 0.15 }] };
  near(run(prop, { wages: 40000, propertyTax: 5000 }), 4000 - 300, 'property tax credit: capped at the maximum');
  near(run(prop, { wages: 40000, propertyTax: 120 }), 4000 - 120, 'property tax credit: limited to the tax paid');
  // AGI 65,000: over 50,000 by 15,000 = 2 steps -> 70% -> 210
  near(run(prop, { wages: 65000, propertyTax: 5000 }), 6500 - 210, 'property tax credit: 15% off per 10,000 over');
  near(run(prop, { wages: 120000, propertyTax: 5000 }), 12000, 'property tax credit: gone far above the limit');
  near(run({ ...prop, tax: flat(0.001) }, { wages: 40000, propertyTax: 5000 }), 0, 'property tax credit: nonrefundable, the tax stops it at zero'); // tax 40, credit 300 -> 0

  // --- Tax forgiveness (PA-style) -----------------------------------------------------------------------------
  const forgive = { credits: [{ kind: 'taxForgiveness', label: 'forgiveness', refundable: false, limit: { single: 6500, mfj: 13000, hoh: 6500 }, perDependent: 9500, stepWidth: 250, stepPct: 0.1 }] };
  near(run(forgive, { wages: 6500 }), 0, 'forgiveness: at the limit, all of the 650 forgiven');
  // base 7,000: over by 500 = 2 steps -> 80% forgiven: tax 700 x 0.2 = 140
  near(run(forgive, { wages: 7000 }), 140, 'forgiveness: 10% per 250 over');
  near(run(forgive, { wages: 9000 }), 900, 'forgiveness: nothing past ten steps');
  near(run(forgive, { wages: 15000, dependents: [kid(5)] }), 0, 'forgiveness: a dependent adds 9,500 to the limit (16,000)');
  near(run(forgive, { wages: 13000 }, 'mfj'), 0, 'forgiveness: the joint limit');

  // --- AGI step fraction credit (CT personal credit) ----------------------------------------------------------
  const frac = { credits: [{ kind: 'agiStepFraction', label: 'personal credit', refundable: false, tables: cols([[0, 0], [15000, 0.75], [18800, 0.7]]) }] };
  near(run(frac, { wages: 17000 }), 1700 * 0.25, 'step fraction: 75% off at an AGI of 17,000');
  near(run(frac, { wages: 18900 }), 1890 * 0.3, 'step fraction: 70% off over 18,800');
  near(run(frac, { wages: 14000 }), 1400, 'step fraction: nothing at or below the first bound');

  // --- Exemption with an AGI step-down (CT-style) -----------------------------------------------------------------
  const exm = { exemption: cols(15000), exemptionPhaseOut: { kind: 'stepDown', start: cols(30000), step: 1000, width: 1000 } };
  near(run(exm, { wages: 20000 }), 500, 'exemption step-down: full exemption below the start (taxable 5,000)');
  // AGI 33,500: over by 3,500 -> 4 steps -> exemption 11,000 -> taxable 22,500 -> 2,250
  near(run(exm, { wages: 33500 }), 2250, 'exemption step-down: 1,000 per 1,000 over');
  near(run(exm, { wages: 50000 }), 5000, 'exemption step-down: gone entirely');

  // --- Dependent exemption -----------------------------------------------------------------------------------------
  near(run({ dependentExemption: 1000 }, { wages: 30000, dependents: [kid(5), kid(10), kid(17, { qualifyingChild: false })] }), 2800, 'dependent exemption: 1,000 per qualifying child (taxable 28,000)');

  // --- Social Security tested on AGI (CT-style) ----------------------------------------------------------------------
  const ssTest = { base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: { kind: 'agiTested', exemptBelow: cols(75000), taxedShareOfBenefits: 0.25 } } };
  // AGI 40,000 + 20,000 taxable SS = 60,000 < 75,000: all 20,000 subtracted -> taxable 40,000 -> 4,000
  near(run(ssTest, { wages: 40000, taxableSS: 20000, ssBenefits: 30000 }), 4000, 'Social Security test: exempt under the AGI');
  // AGI 90,000 >= 75,000: taxed amount = min(20,000, 25% x 30,000) = 7,500; subtraction 12,500 -> 77,500 -> 7,750
  near(run(ssTest, { wages: 70000, taxableSS: 20000, ssBenefits: 30000 }), 7750, 'Social Security test: over the AGI, 25% of benefits taxed');
  // AGI 78,000 (75,000 + 3,000 taxable): min(3,000, 25% x 30,000) = 3,000 is taxed, so nothing is subtracted -> 7,800
  near(run(ssTest, { wages: 75000, taxableSS: 3000, ssBenefits: 30000 }), 7800, 'Social Security test: never more than the federally taxable part is taxed');

  // --- Per-person retirement exclusion (NY / PA style) ----------------------------------------------------------------
  const per = { retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, applies: { pension: true, traditional: true }, tiers: [[0, 20000]], reducedBy: 'none', share: null } };
  // A (62): pension 10,000 + traditional 15,000 = 25,000 -> 20,000 cap; B (50): pension 5,000 (pensions from age 0), traditional 12,000 excluded
  // only from 59.5 -> 0. Exclusion 25,000; base 15,000 + 27,000 = 42,000 -> 17,000 -> 1,700
  const two = { pension: 15000, retirement: 27000, ages: [62, 50], pensionA: 10000, pensionB: 5000, retirementA: 15000, retirementB: 12000 };
  near(run(per, two, 'mfj'), 1700, 'per person: each filer capped and age-tested on their own');
  // No cap: A excludes 25,000, B 5,000 -> taxable 42,000 - 30,000 = 12,000 -> 1,200
  near(run({ retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, applies: { pension: true, traditional: true }, tiers: [[0, null]], reducedBy: 'none', share: null } }, two, 'mfj'), 1200, 'per person: no cap');
  // B absent (age null): only A's 20,000 is excluded -> 42,000 - 20,000 = 22,000 -> 2,200
  near(run(per, { ...two, ages: [62, null] }, 'mfj'), 2200, 'per person: a missing partner is skipped');

  // --- Retirement share by AGI (CT-style) ------------------------------------------------------------------------------
  const phased = { retirementExclusion: { kind: 'agiPhasedShare', inclusive: true, tables: cols([[0, 1], [75000, 0.85], [100000, 0]]) } };
  near(run(phased, { retirement: 50000, wages: 20000 }), 2000, 'AGI-phased share: all excluded under the first bound (taxable 20,000)');
  // AGI 75,000 exactly (inclusive): 85% of 50,000 = 42,500 excluded -> 32,500 -> 3,250
  near(run(phased, { retirement: 50000, wages: 25000 }), 3250, 'AGI-phased share: at the bound the lower share applies');
  near(run(phased, { retirement: 50000, wages: 60000 }), 11000, 'AGI-phased share: none at 110,000 (taxable 110,000)');

  // --- Status columns and indexing ----------------------------------------------------------------------------------------
  const own = { standardDeduction: { single: 1000, mfj: 3000, hoh: 2000 }, exemption: cols(0), statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' } };
  near(run(own, { wages: 10000 }, 'single'), 900, 'columns: single');
  near(run(own, { wages: 10000 }, 'hoh'), 800, 'columns: its own head-of-household column');
  near(run(own, { wages: 10000 }, 'qss'), 700, 'columns: qualifying surviving spouse reads the joint column');
  near(run({ ...own, statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'single' } }, { wages: 10000 }, 'hoh'), 900, 'columns: a state that reads head of household as single');
  st.inflation = 3;
  const f10 = Math.pow(1.03, 10);
  near(run({ ...own, indexing: idx(false) }, { wages: 10000 }, 'single', 10), 900, 'indexing off: the deduction stays nominal');
  near(run({ ...own, indexing: idx(true) }, { wages: 10000 * f10 }, 'single', 10), (10000 * f10 - 1000 * f10) * 0.1, 'indexing on: the deduction follows inflation');
  // Families are independent: brackets fixed, standard deduction indexed (Washington's shape). Brackets 10% to 10,000 then 20%;
  // wages 20,000, deduction 1,000 x 1.3439 = 1,343.92 -> taxable 18,656.08 -> 1,000 + 8,656.08 x 20% = 2,731.22
  const mixed = { tax: { kind: 'graduated', columns: { single: [[0, 0.1], [10000, 0.2]], mfj: [[0, 0.1], [10000, 0.2]], hoh: [[0, 0.1], [10000, 0.2]] } }, standardDeduction: { single: 1000, mfj: 1000, hoh: 1000 } };
  near(run({ ...mixed, indexing: idx(true, { bracketsIndexed: false }) }, { wages: 20000 }, 'single', 10), 1000 + (20000 - 1000 * f10 - 10000) * 0.2, 'indexing: brackets fixed, deduction indexed');
  near(run({ ...mixed, indexing: idx(false, { standardDeductionIndexed: true }) }, { wages: 20000 }, 'single', 10), 1000 + (20000 - 1000 * f10 - 10000) * 0.2, 'indexing: only the deduction flag set');
  near(run({ ...mixed, indexing: idx(true, { standardDeductionIndexed: false }) }, { wages: 20000 * f10 }, 'single', 10), 0.1 * 10000 * f10 + 0.2 * (20000 * f10 - 1000 - 10000 * f10), 'indexing: brackets indexed, deduction fixed');
  // A threshold addition has its own flag: 5% over 10,000 on 20,000 of income at year 10 -> fixed: 500; indexed: (20,000 - 13,439.16) x 5%
  const sur = (indexed) => ({ additions: [{ kind: 'threshold', threshold: 10000, rate: 0.05, indexed }] });
  near(run({ ...sur(false), indexing: idx(true) }, { wages: 20000 }, 'single', 10), 2000 + 500, 'addition fixed: the threshold does not index');
  near(run({ ...sur(true), indexing: idx(false) }, { wages: 20000 }, 'single', 10), 2000 + (20000 - 10000 * f10) * 0.05, 'addition indexed: the threshold follows inflation');
  // A status with its own credit threshold: the child credit reads `qss` (75,000) not the joint 110,000 column
  const kid1 = [kid(8)];
  const qssCredit = { standardDeduction: { single: 0, mfj: 0, hoh: 0 }, statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, credits: [{ kind: 'childCredit', label: 'child', refundable: true, tiers: [[16, 500]], phaseOut: { start: { single: 75000, mfj: 110000, hoh: 75000, qss: 75000 }, width: 1000, per: 16.5 } }] };
  near(run(qssCredit, { wages: 90000, dependents: kid1 }, 'qss'), 9000 - (500 - 15 * 16.5), 'child credit: a status with its own threshold (qss 75,000)');
  near(run(qssCredit, { wages: 90000, dependents: kid1 }, 'mfj'), 9000 - 500, 'child credit: joint 110,000 still applies to joint filers');
  st.inflation = 0;

  // =====================================================================================================
  // 7D mechanisms (commit A). The synthetic row is a flat 10% tax unless a case says otherwise.
  // =====================================================================================================
  const perP = (o) => Object.assign({ kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 0, applies: { pension: true, traditional: true }, tiers: [[0, null]], reducedBy: 'none', share: null }, o);
  const setYear = window.__test_setCurrentYear;
  setYear(2026);

  // --- Mechanism 1: scheduled changes ------------------------------------------------------------------
  // Base: 10% and a 1,000 deduction. From 2028 (year index 2): 8% and a 2,000 deduction. Wages 20,000.
  const sched1 = { standardDeduction: cols(1000), schedule: [{ fromYear: 2028, tax: flat(0.08), standardDeduction: cols(2000) }] };
  near(run(sched1, { wages: 20000 }, 'single', 0), 1900, 'schedule: before the change (20,000 - 1,000) x 10%');
  near(run(sched1, { wages: 20000 }, 'single', 1), 1900, 'schedule: the year before the change');
  near(run(sched1, { wages: 20000 }, 'single', 2), 1440, 'schedule: the change year (20,000 - 2,000) x 8%');
  near(run(sched1, { wages: 20000 }, 'single', 5), 1440, 'schedule: later years keep the latest variant');
  // A later variant on top of an earlier one: 2030 goes to 5% and keeps the 2028 deduction (a variant replaces only what it lists).
  const sched2 = { standardDeduction: cols(1000), schedule: [{ fromYear: 2028, standardDeduction: cols(2000) }, { fromYear: 2030, tax: flat(0.05) }] };
  near(run(sched2, { wages: 20000 }, 'single', 3), 1800, 'schedule: before the 2030 variant only the 2028 one applies');
  near(run(sched2, { wages: 20000 }, 'single', 4), 900, 'schedule: a later variant builds on the earlier one (2030: 5% and the 2028 deduction)');
  // Indexing: 3% a year. The deduction is indexed. The 2028 variant states 2,000 as 2028 dollars, so in 2028 it is exactly 2,000
  // (not 2,000 x 1.03^2), and it grows from there: 2030 is 2,000 x 1.03^2 = 2,121.80.
  st.inflation = 3;
  const sched3 = { indexing: idx(false, { standardDeductionIndexed: true }), standardDeduction: cols(1000), schedule: [{ fromYear: 2028, standardDeduction: cols(2000) }] };
  near(run(sched3, { wages: 20000 }, 'single', 1), 1897, 'schedule indexing: before the variant, 1,000 x 1.03 = 1,030');
  near(run(sched3, { wages: 20000 }, 'single', 2), 1800, 'schedule indexing: statutory 2,000 in its own year');
  near(run(sched3, { wages: 20000 }, 'single', 4), 1787.82, 'schedule indexing: 2,000 x 1.0609 two years on');
  // A variant that overrides only the rate leaves the deduction on the plan-start index: 1,000 x 1.03^4 = 1,125.50881 in 2030.
  const sched4 = { indexing: idx(false, { standardDeductionIndexed: true }), standardDeduction: cols(1000), schedule: [{ fromYear: 2028, tax: flat(0.08) }] };
  near(run(sched4, { wages: 20000 }, 'single', 4), 1509.9592952, 'schedule indexing: a rate-only variant does not rebase the deduction');
  st.inflation = 0;
  // A variant dated in the past (before the plan year) applies from year 0: pin the clock to 2029.
  setYear(2029);
  near(run(sched1, { wages: 20000 }, 'single', 0), 1440, 'schedule: a variant already in force at plan start');
  setYear(2026);

  // --- Mechanism 2: a standard deduction that steps down or phases out with AGI ----------------------------------
  const stepDown = { standardDeduction: cols(3000), standardDeductionPhase: { kind: 'stepDown', columns: { single: { start: 25999, width: 500, step: 25, floor: 2500 }, mfj: { start: 25999, width: 500, step: 25, floor: 2500 }, hoh: { start: 25999, width: 500, step: 25, floor: 2500 } } } };
  near(run(stepDown, { wages: 25999 }), 2299.9, 'step-down: at the start nothing is lost (25,999 - 3,000)');
  near(run(stepDown, { wages: 26000 }), 2302.5, 'step-down: one dollar over is one step of 25 (26,000 - 2,975)');
  near(run(stepDown, { wages: 26499 }), 2352.4, 'step-down: still one step at 500 over');
  near(run(stepDown, { wages: 26500 }), 2355, 'step-down: two steps at 501 over (26,500 - 2,950)');
  near(run(stepDown, { wages: 40000 }), 3750, 'step-down: held at the floor (40,000 - 2,500)');
  const linear = { standardDeduction: cols(15000), standardDeductionPhase: { kind: 'linear', columns: { single: { start: 40000, end: 95000, floor: 0 }, mfj: { start: 40000, end: 95000, floor: 0 }, hoh: { start: 40000, end: 95000, floor: 0 } } } };
  near(run(linear, { wages: 40000 }), 2500, 'linear: at the start the full deduction');
  near(run(linear, { wages: 67500 }), 6000, 'linear: half way, half the deduction (67,500 - 7,500)');
  near(run(linear, { wages: 95000 }), 9500, 'linear: at the end, the floor (0)');
  near(run(linear, { wages: 120000 }), 12000, 'linear: beyond the end stays at the floor');
  const linearFloor = { standardDeduction: cols(15000), standardDeductionPhase: { kind: 'linear', columns: { single: { start: 40000, end: 95000, floor: 3000 }, mfj: { start: 40000, end: 95000, floor: 3000 }, hoh: { start: 40000, end: 95000, floor: 3000 } } } };
  near(run(linearFloor, { wages: 95000 }), 9200, 'linear: a floor above zero holds (95,000 - 3,000)');

  // --- Mechanism 3: age-tiered per-person caps ---------------------------------------------------------------------
  const tiered = { retirementExclusion: perP({ tiers: [[55, 20000], [65, 24000]] }) };
  const pen = (a, b) => ({ pension: a + b, pensionA: a, pensionB: b, retirement: 0, retirementA: 0, retirementB: 0 });
  near(run(tiered, { ...pen(30000, 15000), ages: [66, 58] }, 'mfj'), 600, 'tiers: A at the 65 tier (24,000 of 30,000), B at the 55 tier (all 15,000): 45,000 - 39,000');
  near(run(tiered, { ...pen(30000, 15000), ages: [66, 50] }, 'mfj'), 2100, 'tiers: B under the first tier gets nothing: 45,000 - 24,000');
  near(run(tiered, { ...pen(30000, 15000), ages: [54, 54] }, 'mfj'), 4500, 'tiers: both under the first tier');
  near(run(tiered, { ...pen(30000, 0), ages: [65] }), 600, 'tiers: exactly 65 reaches the top tier');
  near(run(tiered, { ...pen(30000, 0), ages: [64.9] }), 1000, 'tiers: just under 65 is the 20,000 tier');

  // --- Mechanism 4: which buckets qualify ------------------------------------------------------------------------------
  const mix = { pension: 10000, pensionA: 10000, pensionB: 0, retirement: 6000, retirementA: 6000, retirementB: 0, ages: [70] };
  near(run({ retirementExclusion: perP({ applies: { pension: true, traditional: false } }) }, mix), 600, 'applies: pension only excludes 10,000 of 16,000');
  near(run({ retirementExclusion: perP({ applies: { pension: false, traditional: true } }) }, mix), 1000, 'applies: traditional only excludes 6,000 of 16,000');
  near(run({ retirementExclusion: perP({ pensionMinAge: 60, traditionalMinAge: 65 }) }, { ...mix, ages: [62] }), 600, 'applies: bucket minimum ages still gate each bucket (62: pension yes, traditional no)');

  // --- Mechanism 5: a cap shared with Social Security (a per-person bucket) ----------------------------------------------
  const co = { base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: { kind: 'subtraction', seniorAge: 65, belowSeniorCap: 20000 } }, retirementExclusion: perP({ tiers: [[55, 20000], [65, 24000]], reducedBy: 'socialSecuritySubtracted' }) };
  const coSrc = (ss) => ({ ...pen(20000, 0), taxableSS: ss, taxableSSA: ss, taxableSSB: 0, ssBenefits: ss, ssBenefitsA: ss, ages: [70] });
  // Taxable Social Security 10,000 (subtracted in full at 70): room 24,000 - 10,000 = 14,000 of the 20,000 pension.
  // Base 20,000 + 10,000 = 30,000; minus 10,000 and 14,000 = 6,000.
  near(run(co, coSrc(10000)), 600, 'shared cap: benefits 10,000 leave room for 14,000 of pension');
  near(run(co, coSrc(20000)), 1600, 'shared cap: benefits 20,000 leave room for 4,000 (40,000 - 20,000 - 4,000)');
  near(run(co, coSrc(24000)), 2000, 'shared cap: benefits at the cap leave no room (44,000 - 24,000)');
  near(run(co, coSrc(30000)), 2000, 'shared cap: benefits above the cap leave no room (50,000 - 30,000)');
  near(run(co, coSrc(0)), 0, 'shared cap: no benefits, the 20,000 pension is under the 24,000 cap');
  // A couple: A has all the Social Security (20,000), so A has 4,000 of room; B has the full 24,000 for 20,000 of pension.
  near(run(co, { ...pen(20000, 20000), taxableSS: 20000, taxableSSA: 20000, taxableSSB: 0, ssBenefits: 20000, ssBenefitsA: 20000, ssBenefitsB: 0, ages: [70, 70] }, 'mfj'), 1600, 'shared cap: the cap is each person\'s own (60,000 - 20,000 - 4,000 - 20,000 = 16,000)');
  // Maine-style: reduced by all benefits received, taxable or not (Social Security itself exempt here).
  const me = { retirementExclusion: perP({ tiers: [[0, 30000]], reducedBy: 'benefitsReceived' }) };
  near(run(me, { ...pen(25000, 0), ssBenefits: 10000, ssBenefitsA: 10000, ages: [70] }), 500, 'benefits received: 30,000 - 10,000 = 20,000 excluded of 25,000');
  near(run(me, { ...pen(25000, 0), ssBenefits: 40000, ssBenefitsA: 40000, ages: [70] }), 2500, 'benefits received: benefits over the cap leave no exclusion');
  near(run(me, { ...pen(25000, 0), ssBenefits: 40000, ssBenefitsA: 0, ssBenefitsB: 40000, ages: [70] }), 0, 'benefits received: the other partner\'s benefits do not reduce this cap (25,000 excluded)');

  // --- Mechanism 6: the cap and an AGI share together ---------------------------------------------------------------------
  const shareTable = cols([[0, 1], [50000, 0.5], [100000, 0]]);
  const capShare = (inclusive) => ({ retirementExclusion: perP({ tiers: [[0, 20000]], share: { inclusive, tables: shareTable } }) });
  near(run(capShare(false), { ...pen(30000, 0), wages: 20000, ages: [70] }), 3000, 'cap x share: AGI 50,000 is not over the step, share 1: 20,000 excluded');
  near(run(capShare(false), { ...pen(30000, 0), wages: 20001, ages: [70] }), 4000.1, 'cap x share: AGI 50,001 is in the 50% step: 10,000 excluded');
  near(run(capShare(true), { ...pen(30000, 0), wages: 20000, ages: [70] }), 4000, 'cap x share: an inclusive table steps at 50,000');
  near(run(capShare(false), { ...pen(30000, 0), wages: 80000, ages: [70] }), 11000, 'cap x share: AGI 110,000 is past the last step, nothing excluded');

  // --- Mechanism 8: the federal standard deduction as the state deduction ---------------------------------------------------------
  const conform = (o) => ({ federalConformity: { standardDeduction: true, seniorDeduction: false, ageAdditional: false, ...o } });
  near(t.standardDeduction('single', 0, []), 16100, 'the federal helper: single 2026 standard deduction');
  near(run(conform(), { wages: 50000, ages: [40] }), 3390, 'conformity: (50,000 - 16,100) x 10%');
  near(run(conform(), { wages: 50000, ages: [66] }), 3390, 'conformity: without the 65+ add-on, an older filer gets the base only');
  near(run(conform({ ageAdditional: true }), { wages: 50000, ages: [66] }), 3185, 'conformity: with the add-on 16,100 + 2,050');
  near(run(conform({ ageAdditional: true, seniorDeduction: true }), { wages: 50000, ages: [66] }), 2585, 'conformity: and the senior deduction 6,000 (2026)');
  near(run(conform({ ageAdditional: true, seniorDeduction: true }), { wages: 80000, ages: [66, 66] }, 'mfj'), 3250, 'conformity: a senior couple, 32,200 + 2 x 1,650 + 2 x 6,000');
  near(run(conform(), { wages: 50000, ages: [40] }, 'hoh'), 2585, 'conformity: head of household reads 24,150');
  setYear(2029);
  near(run(conform({ ageAdditional: true, seniorDeduction: true }), { wages: 50000, ages: [66] }), 3185, 'conformity: the senior deduction ends after 2028');
  setYear(2026);

  // --- Mechanism 10: senior exemption and an AGI-tiered dependent exemption ---------------------------------------------------------
  const senior = (phaseOut) => ({ seniorExemption: { kind: 'perSenior', age: 65, amount: 1000, phaseOut } });
  near(run(senior(null), { wages: 50000, ages: [66, 67] }, 'mfj'), 4800, 'senior exemption: two seniors, 50,000 - 2,000');
  near(run(senior(null), { wages: 50000, ages: [66, 60] }, 'mfj'), 4900, 'senior exemption: one senior');
  near(run(senior({ start: cols(40000), rate: 0.5 }), { wages: 50000, ages: [66] }), 5000, 'senior exemption: phased out entirely (1,000 - 0.5 x 10,000 < 0)');
  near(run(senior({ start: cols(40000), rate: 0.5 }), { wages: 41000, ages: [66] }), 4050, 'senior exemption: 1,000 - 500 = 500 left');
  near(run(senior({ start: cols(40000), rate: 0.5 }), { wages: 41000, ages: [66, 66] }, 'mfj'), 4000, 'senior exemption: each senior loses the same 500');
  const tiers3 = { dependentExemption: { kind: 'agiTiered', tables: cols([[0, 1000], [50000, 500], [100000, 300]]) } };
  const kids2 = [kid(5), kid(8), kid(20, { qualifyingChild: false })];
  near(run(tiers3, { wages: 40000, dependents: kids2 }), 3800, 'tiered dependents: two qualifying children at 1,000 (40,000 - 2,000)');
  near(run(tiers3, { wages: 50000, dependents: kids2 }), 4800, 'tiered dependents: AGI at the step is still the first tier');
  near(run(tiers3, { wages: 50001, dependents: kids2 }), 4900.1, 'tiered dependents: one dollar over drops to 500 each');
  near(run(tiers3, { wages: 120000, dependents: kids2 }), 11940, 'tiered dependents: 300 each (120,000 - 600)');
  near(run(tiers3, { wages: 120000 }), 12000, 'tiered dependents: no children, no exemption');

  // --- Mechanism 14: an addition with a threshold per filing column --------------------------------------------------------------------
  const surtax = { additions: [{ kind: 'threshold', indexed: false, threshold: { single: 50000, mfj: 100000, hoh: 75000 }, rate: 0.05 }] };
  near(run(surtax, { wages: 120000 }, 'single'), 15500, 'threshold per column: single 12,000 + 70,000 x 5%');
  near(run(surtax, { wages: 120000, ages: [40, 40] }, 'mfj'), 13000, 'threshold per column: joint 12,000 + 20,000 x 5%');
  near(run(surtax, { wages: 120000 }, 'hoh'), 14250, 'threshold per column: head of household 12,000 + 45,000 x 5%');

  // --- Mechanism 15 through taxFor: each partner's own benefits reach the state ------------------------------------------------
  // A cap of 30,000 reduced by the filer's own benefits. A (70) has the pension 25,000; B (68) has none. The state tax is the
  // difference from Texas (the federal part is identical).
  R.zzb = mk({ retirementExclusion: perP({ tiers: [[0, 30000]], reducedBy: 'benefitsReceived' }) });
  const bp = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 25000, otherB: 0, wageA: 0, wageB: 0, pensionA: 25000, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 70, ageB: 68, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] }, o);
  const stateOnly = (p) => { st.stateTax = 'zzb'; const a = t.taxFor(p, 0, 0); st.stateTax = 'tx'; return a - t.taxFor(p, 0, 0); };
  near(stateOnly(bp({ ssA: 12000 })), 700, 'taxFor, joint: A\'s own benefits 12,000 leave 18,000 excluded of 25,000');
  near(stateOnly(bp({ ssB: 12000 })), 0, 'taxFor, joint: B\'s benefits do not reduce A\'s cap (25,000 excluded)');
  near(stateOnly(bp({ filing: 'single', ssA: 12000 })), 700, 'taxFor, two returns: A\'s return reads A\'s benefits');
  near(stateOnly(bp({ filing: 'single', ssB: 12000 })), 0, 'taxFor, two returns: B\'s benefits stay on B\'s return');
  near(stateOnly(bp({ filing: 'single', singlePerson: true, ageB: null, ssA: 12000 })), 700, 'taxFor, one person: reads A\'s benefits');
  delete R.zzb;
  setYear(new Date().getFullYear());

  // =====================================================================================================
  // 7D mechanisms (commit B): 7 (federal tax paid), 9 (Social Security rules), 12 (income-tested credits),
  // 13 (gains shapes) and the flat local tax. Mechanism 11 (circuit breakers) was dropped by the owner.
  // =====================================================================================================
  const pf = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 50, ageB: 48, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] }, o);
  const baseWith = (ss, o) => ({ ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: ss, ...o });
  const ssSrc = (o) => ({ pension: 20000, pensionA: 20000, taxableSS: 30000, taxableSSA: 30000, ssBenefits: 30000, ssBenefitsA: 30000, ages: [70], ...o });

  // --- Mechanism 9: age and AGI tiers (Colorado-style) ---------------------------------------------------------------------
  const ssT = { base: baseWith({ kind: 'ageAgiTiered', tiers: [{ minAge: 55, agiLimit: cols(75000), capOverLimit: 20000 }, { minAge: 65, agiLimit: null, capOverLimit: 0 }] }) };
  near(run(ssT, ssSrc({})), 2000, 'ss tiers: 65+ subtract all (50,000 - 30,000)');
  near(run(ssT, ssSrc({ ages: [60] })), 2000, 'ss tiers: 55-64 under the AGI limit subtract all');
  near(run(ssT, ssSrc({ ages: [60], wages: 25000 })), 4500, 'ss tiers: AGI exactly at the limit (75,000) still subtracts all');
  near(run(ssT, ssSrc({ ages: [60], wages: 25001 })), 5500.1, 'ss tiers: one dollar over the limit caps the subtraction at 20,000 (75,001 - 20,000)');
  near(run(ssT, ssSrc({ ages: [60], wages: 40000 })), 7000, 'ss tiers: well over the limit, capped at 20,000 (90,000 - 20,000)');
  near(run(ssT, ssSrc({ ages: [50] })), 5000, 'ss tiers: under the first tier subtract nothing');
  // A couple: A (66) has 5,000 of taxable benefits, B (58) 25,000. Federal AGI 100,000 is over B's limit (mfj 95,000), so B is capped at 20,000;
  // A has no limit: 25,000 subtracted, 100,000 - 25,000 = 75,000.
  const ssTj = { base: baseWith({ kind: 'ageAgiTiered', tiers: [{ minAge: 55, agiLimit: cols(95000), capOverLimit: 20000 }, { minAge: 65, agiLimit: null, capOverLimit: 0 }] }) };
  near(run(ssTj, { wages: 50000, pension: 20000, taxableSS: 30000, taxableSSA: 5000, taxableSSB: 25000, ages: [66, 58] }, 'mfj'), 7500, 'ss tiers: each filer reads their own age and benefits');
  near(run(ssTj, { wages: 40000, pension: 20000, taxableSS: 30000, taxableSSA: 5000, taxableSSB: 25000, ages: [66, 58] }, 'mfj'), 6000, 'ss tiers: AGI 90,000 under B\'s limit, all 30,000 subtracted (90,000 - 30,000 = 60,000... 5,000 + 25,000)');
  const shareT = { base: baseWith({ kind: 'agiShare', inclusive: false, tables: cols([[0, 1], [50000, 0.5], [75000, 0]]) }) };
  const shSrc = (w) => ({ wages: w, pension: 20000, pensionA: 20000, taxableSS: 10000, taxableSSA: 10000, ages: [70] });
  near(run(shareT, shSrc(0)), 2000, 'ss share: AGI 30,000 subtracts all 10,000');
  near(run(shareT, shSrc(30000)), 5500, 'ss share: AGI 60,000 subtracts half');
  near(run(shareT, shSrc(50000)), 8000, 'ss share: AGI 80,000 subtracts none');
  const phaseT = { base: baseWith({ kind: 'agiPhaseOut', start: cols(50000), end: cols(60000) }) };
  near(run(phaseT, shSrc(20000)), 4000, 'ss phase-out: at the start, all of it');
  near(run(phaseT, shSrc(25000)), 5000, 'ss phase-out: half way, half of it (55,000 - 5,000)');
  near(run(phaseT, shSrc(30000)), 6000, 'ss phase-out: at the end, none');
  near(run(phaseT, shSrc(40000)), 7000, 'ss phase-out: past the end, none');
  const ssCr = (w) => ({ base: baseWith('taxed'), credits: [{ kind: 'ssCredit', label: 'ss credit', refundable: false, rate: 0.04, phase: { start: cols(30000), rate: 0.02 } }] });
  near(run(ssCr(), { pension: 20000, taxableSS: 10000 }), 2600, 'ss credit: 4% of 10,000 off a 3,000 tax');
  near(run(ssCr(), { wages: 10000, pension: 20000, taxableSS: 10000 }), 3800, 'ss credit: AGI 40,000 cuts it by 2 cents per dollar over 30,000 (400 - 200)');
  near(run(ssCr(), { wages: 40000, pension: 20000, taxableSS: 10000 }), 7000, 'ss credit: gone at AGI 70,000');

  // --- Mechanism 12: an income-tested flat credit -------------------------------------------------------------------------
  const itc = (o) => ({ credits: [{ kind: 'incomeTestedCredit', label: 'flat credit', refundable: false, amount: cols(100), perSenior: { age: 60, amount: 50 }, perDependent: 25, limit: cols(50000), taper: null, ...o }] });
  near(run(itc(), { wages: 30000, ages: [40] }), 2900, 'income-tested credit: 3,000 - 100');
  near(run(itc(), { wages: 30000, ages: [61] }), 2850, 'income-tested credit: plus 50 for a filer 60+');
  near(run(itc(), { wages: 30000, ages: [61, 62] }, 'mfj'), 2800, 'income-tested credit: two seniors, 100 + 2 x 50 = 200');
  near(run(itc(), { wages: 30000, ages: [61, 62], dependents: [kid(5), kid(9), kid(20, { qualifyingChild: false })] }, 'mfj'), 2750, 'income-tested credit: plus 25 per qualifying child');
  near(run(itc(), { wages: 50000 }), 4900, 'income-tested credit: AGI at the limit still qualifies');
  near(run(itc(), { wages: 50001 }), 5000.1, 'income-tested credit: one dollar over loses it (no taper)');
  const taper = { taper: { width: 1000, pct: 0.25 } };
  near(run(itc(taper), { wages: 50500 }), 4975, 'income-tested credit: one taper step (100 x 0.75)');
  near(run(itc(taper), { wages: 51001 }), 5050.1, 'income-tested credit: two steps (100 x 0.5)');
  near(run(itc(taper), { wages: 54000 }), 5400, 'income-tested credit: four steps, gone');
  // A share of the tax up to a cap (Ohio's joint filing credit): 20% of the tax, at most 650.
  const share = { credits: [{ kind: 'taxShareCredit', label: 'share credit', refundable: false, share: cols(0.2), max: cols(650) }] };
  near(run(share, { wages: 50000 }), 4350, 'tax share credit: 20% of 5,000 is 1,000, capped at 650');
  near(run(share, { wages: 2000 }), 160, 'tax share credit: below the cap it is 20% of the tax (200 - 40)');
  // A property tax share (Illinois: 5%, gone above an AGI limit): property tax 6,000.
  const pts = { credits: [{ kind: 'propertyTaxShareCredit', label: 'property tax credit', refundable: false, rate: 0.05, agiLimit: cols(250000) }] };
  near(run(pts, { wages: 100000, propertyTax: 6000 }), 10000 - 300, 'property tax share credit: 5% of 6,000');
  near(run(pts, { wages: 250000, propertyTax: 6000 }), 25000 - 300, 'property tax share credit: at the AGI limit');
  near(run(pts, { wages: 250001, propertyTax: 6000 }), 25000.1, 'property tax share credit: gone one dollar over');
  // A tier cap by filing column (New Jersey: 75,000 single, 100,000 joint): pension 90,000 of one 65-year-old filer.
  const colCap = { retirementExclusion: perP({ tiers: [[62, { single: 75000, mfj: 100000, hoh: 75000 }]] }) };
  near(run(colCap, { ...pen(90000, 0), ages: [65] }, 'single'), 1500, 'tier cap by column: single 75,000 of 90,000 excluded');
  near(run(colCap, { ...pen(90000, 0), ages: [65, 40] }, 'mfj'), 0, 'tier cap by column: joint 100,000 covers all 90,000');
  const lineTaper = { taper: { rate: 0.1 } };
  near(run(itc(lineTaper), { wages: 50500 }), 5000, 'income-tested credit: a straight-line taper loses 10 cents per dollar (100 - 50)');
  near(run(itc(lineTaper), { wages: 51000 }), 5100, 'income-tested credit: and is gone after 1,000');
  near(run(itc(lineTaper), { wages: 50000 }), 4900, 'income-tested credit: nothing is lost at the limit');
  near(run(itc({ refundable: true, amount: cols(500), limit: null, perSenior: null, perDependent: 0 }), { wages: 1000 }), -400, 'income-tested credit: a refundable credit takes the tax below zero (100 - 500)');

  // --- Mechanism 13: gains shapes ----------------------------------------------------------------------------------------------
  const gs = (o, rest) => ({ base: baseWith('exempt', o), ...rest });
  near(run(gs({ gainsRate: 0.05, gainsDeduction: 1000 }), { wages: 20000, gains: 11000 }), 2500, 'gains rate: ordinary 2,000 + (11,000 - 1,000) x 5%');
  near(run(gs({ gainsRate: 0.05, gainsDeduction: 1000 }, { standardDeduction: cols(5000) }), { wages: 20000, gains: 11000 }), 2000, 'gains rate: the deduction offsets only the ordinary income (1,500 + 500)');
  near(run(gs({ gainsRate: 0.05, gainsDeduction: 1000 }, { standardDeduction: cols(5000) }), { wages: 3000, gains: 11000 }), 500, 'gains rate: a deduction larger than the ordinary income does not offset gains');
  near(run(gs({ gainsRate: null, gainsDeduction: 1000 }), { wages: 20000, gains: 11000 }), 3000, 'gains deduction alone: (20,000 + 10,000) x 10%');
  near(run(gs({ gainsRate: 0.05, gainsDeduction: 1000, gainsIncluded: 0.5 }), { wages: 0, gains: 11000 }), 225, 'gains rate: half included, less the deduction, at 5% ((5,500 - 1,000) x 5%)');

  // --- The flat local tax (MD, IN) ----------------------------------------------------------------------------------------------------
  const loc = (o) => ({ localTax: { kind: 'flat', rate: 0.03 }, standardDeduction: cols(5000), ...o });
  near(run(loc(), { wages: 50000 }), 5850, 'local tax: 4,500 state + 3% of the 45,000 taxable');
  near(run(loc(itc({ perSenior: null, perDependent: 0, amount: cols(500), limit: null })), { wages: 50000 }), 5350, 'local tax: a state credit does not reduce it (4,500 - 500 + 1,350)');
  // It feeds the federal itemized deduction: single, wages 200,000, property tax 10,000, state tax 20,000 + local 6,000. SALT 36,000 (under the cap)
  // instead of 30,000: 6,000 more deducted at 24% (taxable 164,000 and 170,000 are both in the 24% bracket), so the combined tax rises by 6,000 - 1,440.
  R['zzloc' + n] = mk(loc({ standardDeduction: zero3 })); R['zzlocz' + n] = mk({}); const locN = n++;
  const withLocal = (code) => { st.stateTax = code; return t.taxFor(pf({ filing: 'single', singlePerson: true, ageB: null, ageA: 40, otherA: 200000, wageA: 200000, propertyTax: 10000 }), 0, 0); };
  near(withLocal('zzloc' + locN) - withLocal('zzlocz' + locN), 4560, 'local tax: feeds the federal SALT deduction');
  delete R['zzloc' + locN]; delete R['zzlocz' + locN];

  // --- Mechanism 7: federal income tax paid, from one lagged pass ---------------------------------------------------------------------
  const lag = (o) => ({ federalTaxSubtraction: { kind: 'lagged', placement: 'subtraction', cap: null, phase: null, ...o } });
  const lagTax = (row, p) => { const code = 'zzl' + n++; R[code] = mk(row); st.stateTax = code; const a = t.taxFor(p, 0, 0); st.stateTax = 'tx'; const b = t.taxFor(p, 0, 0); delete R[code]; return a - b; };
  const lp = (o) => pf(Object.assign({ filing: 'single', singlePerson: true, ageB: null, ageA: 40, wageA: 100000, otherA: 100000 }, o));
  // Single, wages 100,000, 2026: taxable 83,900 = 1,240 + 4,560 + 33,500 x 22% = 13,170 of federal tax; state (100,000 - 13,170) x 10%.
  near(lagTax(lag(), lp({})), 8683, 'federal tax paid: single, 13,170 subtracted');
  // Joint wages 100,000 (60,000 + 40,000): taxable 67,800 = 2,480 + 43,000 x 12% = 7,640; state (100,000 - 7,640) x 10%.
  const jp = (o) => pf(Object.assign({ filing: 'mfj', wageA: 60000, wageB: 40000, otherA: 60000, otherB: 40000 }, o));
  near(lagTax(lag(), jp({})), 9236, 'federal tax paid: joint, 7,640 subtracted');
  // With a child under 17 the 2,200 child tax credit comes off the liability first: 5,440.
  near(lagTax(lag(), jp({ dependents: [kid(5)] })), 9456, 'federal tax paid: the nonrefundable child credit reduces the tax deducted');
  // Two separate returns: A 60,000 (federal 5,020) and B 40,000 (2,620): (60,000 - 5,020) x 10% + (40,000 - 2,620) x 10%.
  near(lagTax(lag(), pf({ filing: 'single', wageA: 60000, wageB: 40000, otherA: 60000, otherB: 40000 })), 9236, 'federal tax paid: each separate return deducts its own');
  const cap5 = { single: 5000, mfj: 10000, hoh: 5000 };
  near(lagTax(lag({ cap: cap5 }), lp({})), 9500, 'federal tax paid: capped at 5,000');
  near(lagTax(lag({ cap: cap5, phase: { basis: 'cap', tables: cols([[0, 1], [90000, 0.5], [120000, 0]]) } }), lp({})), 9750, 'federal tax paid: the cap halved by an AGI step (2,500)');
  // Missouri-style: the share applies to the federal tax itself (35% / 25% / 15% / 5% by income), then the cap: single, federal tax 13,170, income 100,000 -> the 15% step is for
  // 50,001-100,000 (income exactly 100,000), so 15% x 13,170 = 1,975.50 -> (100,000 - 1,975.50) x 10% = 9,802.45
  const moTax = { basis: 'tax', tables: cols([[0, 0.35], [25000, 0.25], [50000, 0.15], [100000, 0.05], [125000, 0]]) };
  near(lagTax(lag({ cap: cap5, phase: moTax }), lp({})), 9802.45, 'federal tax paid: a share of the tax (15% at income 100,000)');
  near(lagTax(lag({ cap: cap5, phase: moTax }), lp({ wageA: 30000, otherA: 30000 })), 2964.5, 'federal tax paid: income 30,000, the 25% step of the federal tax 1,420 (355)');
  const itemizedRow = (o) => ({ standardDeduction: cols(3000), federalTaxSubtraction: { kind: 'lagged', placement: 'itemized', cap: null, phase: null, ...o } });
  near(lagTax(itemizedRow({}), lp({})), 8683, 'federal tax paid, itemized: 13,170 beats the 3,000 standard deduction');
  near(lagTax(itemizedRow({ cap: cap5 }), lp({})), 9500, 'federal tax paid, itemized: capped at 5,000, still above 3,000');
  near(lagTax(itemizedRow({}), lp({ wageA: 20000, otherA: 20000 })), 1700, 'federal tax paid, itemized: 390 of federal tax loses to the 3,000 standard deduction');

  // --- Plumbing through taxFor: each partner's discretionary traditional draw follows the account-ledger share ---
  // A retiree couple (A 62, B 50) draws 100,000 from traditional accounts; the synthetic state excludes a filer's own
  // traditional income from 59.5, so only A's part is excluded. The state tax is the difference between the same
  // profile under the synthetic state and under Texas (the federal part is identical: the standard deduction wins).
  R.zzp = mk({ retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, applies: { pension: true, traditional: true }, tiers: [[0, null]], reducedBy: 'none', share: null } });
  const profile = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 62, ageB: 50, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] }, o);
  const stateOf = (p, trad) => { st.stateTax = 'zzp'; const a = t.taxFor(p, 0, trad); st.stateTax = 'tx'; return a - t.taxFor(p, 0, trad); };
  near(stateOf(profile({ ownerShareA: 0.8 }), 100000), 2000, 'taxFor: A holds 80% of the pool, 80,000 excluded, 20,000 taxed');
  near(stateOf(profile({}), 100000), 5000, 'taxFor: no ledger share means an even split (50,000 excluded)');
  near(stateOf(profile({ ownerShareA: 1, ageB: null, singlePerson: true, filing: 'single' }), 100000), 0, 'taxFor: a one-person return holds all of it (100,000 excluded)');
  // Two separate returns (a couple filing as single): the same split decides whose return carries the draw. The
  // synthetic state excludes A's 80,000 on A's return and taxes B's 20,000 on B's: 2,000, not the 5,000 an even split gives.
  const sep = (o) => profile(Object.assign({ filing: 'single' }, o));
  near(stateOf(sep({ ownerShareA: 0.8 }), 100000), 2000, 'taxFor, two returns: A\'s share of the draw is on A\'s return');
  near(stateOf(sep({}), 100000), 5000, 'taxFor, two returns: no share means half on each return');
  // The federal tax follows too (Texas, no state tax): A's 80,000 and B's 20,000 against 50,000 each, standard deduction each.
  st.stateTax = 'tx';
  const sd = t.standardDeduction('single', 0, [62]), sdB = t.standardDeduction('single', 0, [50]);
  const fed = (a, b) => t.ordinaryTax(a, 0, 'single', sd) + t.ordinaryTax(b, 0, 'single', sdB);
  near(t.taxFor(sep({ ownerShareA: 0.8 }), 0, 100000) - t.taxFor(sep({}), 0, 100000), fed(80000, 20000) - fed(50000, 50000), 'taxFor, two returns: the federal tax follows the split');
  delete R.zzp;

  st.stateTax = 'tx';
  return fails;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(checks);
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(failures, [], 'state mechanisms:\n  ' + failures.join('\n  '));
  console.log('[US] state mechanism tests passed (recapture, AGI steps, credits, exclusions, columns, indexing)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
