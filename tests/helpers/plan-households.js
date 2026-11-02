// The households of the stateless-engine checks (tests/unit/shared/engine-ratchet.test.js, tests/analysis_parity.js):
// a few simple ones per country, and the US households with a cliff plan (PLAN_G58, PLAN_G62; see the
// plan's "Households with a cliff plan"), the order lever's ORDER_H1 ... ORDER_H4 and ORDER_DROP (tests/unit/us/order-lever.test.js)
// and the split lever's SPLIT_H1, SPLIT_ML and SPLIT_CONV (tests/unit/us/two-return-split.test.js).
// Patches over the defaults (normalizeState fills the rest). CommonJS so both the Vitest suite (createRequire) and the Playwright scripts can load it.
const { scenarios } = require('../snapshot_scenarios.js');
const { legacyToAccounts } = require('../legacy_balances.js');

const ACCOUNTS0 = { tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, rothIraBasisA: 0, rothIraBasisB: 0 };

// `std G single 58 aca default`, converted with legacyToAccounts. Its kept plan has three `under aca400` intents (62-64).
const PLAN_G58 = {
  singlePerson: true, children: [], ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', rothConvEnabled: true, rothConvBracket: 22, rothConvStartAge: 58,
  rothConvEndAge: 72, withdrawalMixEnabled: false, smoothWithdrawals: false, ruleOf55A: false, ruleOf55B: false,
  sepp72tK401A: false, taxable: 300000, spending: 60000, ...ACCOUNTS0, trad401kA: 1500000, rothIraA: 200000,
};

// `std G mfj 62 aca 400% smooth` (the neighbouring row; it keeps the same three intents).
function planG62() {
  const g62 = scenarios(true).find((s) => s.name === 'std G mfj 62 aca 400% smooth');
  return legacyToAccounts(g62.patch, null);
}

const LOAN = { principal: 40000, balance: 30000, rate: 6, term: 10, extra: 500 };
const SURVIVOR = { survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 80 };
const CHILD = { children: [{ birthYear: 2015 }] };
// Spending well above income: the plan depletes in its 60s (US 62, Canada 63) after its peak, so the tornado measures peak value.
const DEPLETING = { spending: 120000 };

// Batch 5 step 4c, the order lever (tests/unit/us/order-lever.test.js): scan-grid households (tests/unit/helpers/scan-grid.mjs,
// conversions off, so every order year is one whose natural pass converts nothing: A15 (a)) whose `choose` with
// `levers: { order: true, split: false }` keeps traditional-first in some year.
const ORDER_GRID = {
  children: [], lifeExpectancyA: 95, lifeExpectancyB: 95, acaEnabled: true, acaEnhanced: false, stateTax: 'tx', smoothWithdrawals: false,
  withdrawalMixEnabled: false, rothConvEnabled: false, rothConvEndAge: 72, rothConvBracket: 22, ruleOf55A: false, ruleOf55B: false,
  sepp72tK401A: false, cliffGuardEnabled: true, ...ACCOUNTS0,
};
// ORDER_DROP: order intents only, which the whole-run keep rule drops (Task 2's H1, moved in Task 3: with the toggle on its kept
// plan holds no order, since the order at 68 depletes at 95 where the plan without it never does). `single person; age 66;
// 401(k) 500k A; taxable 300k; spending 60.2k; elections none; conversions off`. The grid household (spending 60k) stopped showing
// that with the maintained bond reserve (Batch 5 step 5b): its order no longer depletes, it just scores lower. It sits on the edge
// of lasting to 95, so the spending was found by trying 60,000-60,450 in steps of 50: 60,200 is the one that shows it.
const ORDER_DROP = {
  ...ORDER_GRID, singlePerson: true, ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, rothConvStartAge: 66, taxable: 300000,
  spending: 60200, trad401kA: 500000, rothIraA: 200000,
};
// H1: order intents only, and the kept plan with the toggle on keeps them. `couple, MFJ; age 62; 401(k) 250k A + 250k B;
// taxable 300k; spending 60k; elections none; conversions off`.
const ORDER_H1 = {
  ...ORDER_GRID, singlePerson: false, filingStatus: 'mfj', ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, rothConvStartAge: 62,
  taxable: 300000, spending: 60000, trad401kA: 250000, trad401kB: 250000, rothIraA: 100000, rothIraB: 100000,
};
// H2: an order intent and a cliff intent in the same year. `couple, MFJ; age 58; 401(k) 250k A + 250k B; taxable 2000k;
// spending 60k; elections none; conversions off`.
const ORDER_H2 = {
  ...ORDER_GRID, singlePerson: false, filingStatus: 'mfj', ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, rothConvStartAge: 58,
  taxable: 2000000, spending: 60000, trad401kA: 250000, trad401kB: 250000, rothIraA: 100000, rothIraB: 100000,
};
// H3: two single returns until a marry-later wedding at 70, with an order intent before it (the `couple, two single returns`
// row of H2's balances).
const ORDER_H3 = { ...ORDER_H2, filingStatus: 'single', marryLater: true, marriageAgeA: 70 };
// H4: an order year with no lines in reach (Texas, no ACA, IRMAA out of reach: H2 with taxable 300k, ACA off).
const ORDER_H4 = { ...ORDER_H2, taxable: 300000, acaEnabled: false };
// Batch 5 step 4d, the split lever (tests/unit/us/two-return-split.test.js). SPLIT_H1: `couple filing single (two returns);
// both 60 and retired; B's pension 90k a year from 60, A none; 401(k) 1000k A + 1000k B; taxable 0; cash 0; spending 120k;
// conversions off; guard on; withdrawal toggle on; TX` (life 100, the default). A's own return holds no income before Social
// Security, so drawing A's traditional accounts first moves the draw off B's pension-filled return.
const SPLIT_H1 = {
  ...ACCOUNTS0, children: [], singlePerson: false, filingStatus: 'single', marryLater: false, ageA: 60, ageB: 60, retireAgeA: 60,
  retireAgeB: 60, pensionCoverage: 'b', pensionYearlyA: 0, pensionStartAgeA: 60, pensionYearlyB: 90000, pensionStartAgeB: 60,
  trad401kA: 1000000, trad401kB: 1000000, taxable: 0, cash: 0, spending: 120000, rothConvEnabled: false, rothConvStartAge: 60,
  rothConvEndAge: 61, cliffGuardEnabled: true, withdrawalMixEnabled: true, smoothWithdrawals: false, acaEnabled: false,
  stateTax: 'tx', ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false,
};
// SPLIT_ML: SPLIT_H1 marrying at A's 63 (joint returns from then: no split).
const SPLIT_ML = { ...SPLIT_H1, marryLater: true, marriageAgeA: 63 };
// SPLIT_CONV: SPLIT_H1 converting at 60-61 (a conversion year never splits: D3, D5). At the 24% bracket since Batch 5 follow-ups
// S1: the fill counts the year's draw, so the default 22% fill converts nothing on top of the 120k draw and B's pension (60 and 61
// then split); at 24% the two years convert about 22.5k and 23.1k.
const SPLIT_CONV = { ...SPLIT_H1, rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 61, rothConvBracket: 24 };
// [name, patch] per country. The ratchet test runs these lists; the parity script adds DEPLETING.
function households(isUS) {
  return isUS
    ? [
        ['default', {}],
        ['survivor', SURVIVOR],
        ['child', CHILD],
        ['inherited IRA', { oneTimeIncome: [{ age: 50, amount: 100000, kind: 'inheritedTrad' }] }],
        ['self-employment', { incomeKindA: 'self' }],
        ['wages lump', { oneTimeIncome: [{ age: 50, amount: 50000, kind: 'wages', owner: 'A' }] }],
        ['loan', { loans: [LOAN] }],
        ['ny', { stateTax: 'ny' }],
        ['ca', { stateTax: 'ca' }],
        ['pa', { stateTax: 'pa' }],
        ['PLAN_G58', PLAN_G58],
        ['PLAN_G62', planG62()],
      ]
    : [
        ['default', {}],
        ['survivor', SURVIVOR],
        ['child', CHILD],
        ['qc', { province: 'qc' }],
        ['ns', { province: 'ns' }],
        ['mb', { province: 'mb' }],
        ['single with OAS', { singlePerson: true, ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66 }],
      ];
}

module.exports = { ACCOUNTS0, PLAN_G58, planG62, LOAN, SURVIVOR, CHILD, DEPLETING, ORDER_DROP, ORDER_H1, ORDER_H2, ORDER_H3, ORDER_H4, SPLIT_H1, SPLIT_ML, SPLIT_CONV, households };
