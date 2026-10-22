// The households of the stateless-engine checks (tests/unit/shared/engine-ratchet.test.js, tests/analysis_parity.js):
// a few simple ones per country, and the US households with a cliff plan (PLAN_G58, PLAN_G62, PLAN_G58_SCHED; see the
// plan's "Households with a cliff plan"). Patches over the defaults (normalizeState fills the rest). CommonJS so both the
// Vitest suite (createRequire) and the Playwright scripts can load it.
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

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
function schedule(ages, cycle) {
  const o = {};
  ages.forEach((a, i) => (o[a] = cycle[i % cycle.length]));
  return o;
}
// PLAN_G58 with applied schedules (Task 3): a Roth schedule at 12% where the setting is 22%, and a mix schedule in the
// form of the `std R mixApplied` row. With them, the optimizer trials' override maps change the plan (the trials' first
// maps, a flat 22% and no mix, differ from the applied schedules), so a trial planned with the wrong maps shows.
const PLAN_G58_SCHED = {
  ...PLAN_G58,
  appliedRothSchedule: schedule(range(58, 72), [12]),
  appliedMixSchedule: schedule(range(58, 85), ['taxable', 'traditional', 'roth', 'balanced', 'smoothed', 'taxTradHalf', 'thirds', 0]),
};

const LOAN = { principal: 40000, balance: 30000, rate: 6, term: 10, extra: 500 };
const SURVIVOR = { survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 80 };
const CHILD = { children: [{ birthYear: 2015 }] };
// Spending well above income: the plan depletes in its 60s (US 62, Canada 63) after its peak, so the tornado measures peak value.
const DEPLETING = { spending: 120000 };

// [name, patch] per country. The ratchet test runs these lists; the parity script adds PLAN_G58_SCHED and DEPLETING.
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

module.exports = { ACCOUNTS0, PLAN_G58, PLAN_G58_SCHED, planG62, LOAN, SURVIVOR, CHILD, DEPLETING, households };
