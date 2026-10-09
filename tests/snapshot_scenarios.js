// Scenario grid for tests/snapshot.js. Pure data: each scenario is a patch of
// `state` fields applied over the planner's own defaults, plus how to run it.
//
//   kind 'std'  -> simulate(retireAgeA + shift, retireAgeB + shift)
//   kind 'hist' -> simulateHistorical(rowFn) with rowFn built from `series`
//
// The grid deliberately covers every branch the Phase 2 refactor touches
// (withdrawal paths, Roth conversion / meltdown, penalties, survivor,
// guardrails, bond reserve, housing, the add-as-you-go lists) for BOTH the
// standard engine and the historical engine.

const US_R = {
  // "Early retiree": both retired now, well before 59.5, so every withdrawal
  // path (taxable, traditional with penalty, Roth ledger, bond buckets) runs.
  ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50,
  lifeExpectancyA: 95, lifeExpectancyB: 95,
  taxable: 700000, traditional: 900000, roth: 200000, cash: 60000,
  spending: 90000, stateTax: 'tx',
};
const CA_R = {
  ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50,
  lifeExpectancyA: 95, lifeExpectancyB: 95,
  taxable: 700000, traditional: 900000, roth: 200000, cash: 60000,
  spending: 80000, province: 'on',
};

const LISTS = {
  loans: [{ principal: 40000, balance: 30000, rate: 6, term: 10, extra: 500 }],
  incomeSources: [{ amount: 20000, startAge: 55, endAge: 66, followGrowth: true, growth: 3 }],
  oneTimeIncome: [{ amount: 50000, age: 60, flat: true }],
  extraExpenses: [{ amount: 8000, startAge: 53, endAge: 80, followGrowth: true, growth: 2.5 }],
  spendingTiers: [{ amount: 70000, startAge: 65, endAge: 120, followGrowth: true, growth: 2.5 }],
  lumpExpenses: [{ amount: 30000, age: 58, repeatEvery: 10, untilAge: 90, flat: false, followGrowth: true, growth: 2.5 }],
};
const ALL_LISTS = { ...LISTS };
// ~$400k/yr of taxable income for six years: pushes a couple past the point
// where MFJ and single-filer brackets / NIIT thresholds diverge.
const HI_INCOME = [{ amount: 400000, startAge: 52, endAge: 58, followGrowth: false, growth: 0 }];

function mixSchedule(ages, cycle) {
  const o = {};
  ages.forEach((a, i) => (o[a] = cycle[i % cycle.length]));
  return o;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function usStd() {
  const D = {};
  const R = US_R;
  return [
    ['default', D],
    ['default single', { ...D, singlePerson: true }],
    ['default rent', { ...D, tenure: 'rent' }],
    ['default rentThenBuy', { ...D, tenure: 'rentThenBuy' }],
    ['default guardrails', { ...D, guardrailsEnabled: true }],
    ['default megaBackdoor+match', { ...D, megaBackdoor: true, matchA: 5000, matchB: 3000, k401Type: 'roth' }],
    ['default megaBackdoor 50+', { ...D, megaBackdoor: true, ageA: 52, ageB: 51, retireAgeA: 60, retireAgeB: 60 }],
    ['default pay over comp limit+match', { ...D, incomeA: 500000, matchA: 6, profitSharingPctA: 10 }],
    ['default low pay 55 megaBackdoor', { ...D, singlePerson: true, ageA: 55, retireAgeA: 62, incomeA: 40000, megaBackdoor: true }],
    ['default aca+retire-late-B', { ...D, acaEnabled: true, retireAgeB: 60, employerCoversSpouseA: false }],
    ['R', R],
    ['R single', { ...R, singlePerson: true }],
    ['R smooth', { ...R, smoothWithdrawals: true }],
    ['R mixLive', { ...R, withdrawalMixEnabled: true }],
    ['R mixLive+smooth', { ...R, withdrawalMixEnabled: true, smoothWithdrawals: true }],
    ['R mixApplied', { ...R, appliedMixSchedule: mixSchedule(range(52, 80), ['taxable', 'traditional', 'roth', 'balanced', 'smoothed', 'taxTradHalf', 'thirds', 0]) }],
    ['R mixApplied+live', { ...R, withdrawalMixEnabled: true, appliedMixSchedule: mixSchedule(range(52, 70), ['traditional', 'thirds']) }],
    ['R rothSchedule', { ...R, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 62, appliedRothSchedule: mixSchedule(range(52, 62), [12, 22, 24, 0]) }],
    ['R rothConv', { ...R, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 60, rothConvBracket: 22 }],
    ['R rothConv+aca', { ...R, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 60, rothConvBracket: 24, acaEnabled: true }],
    ['R rothConv+aca+live', { ...R, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 62, rothConvBracket: 24, acaEnabled: true, withdrawalMixEnabled: true }],
    ['R aca', { ...R, acaEnabled: true }],
    ['R acaEnhanced', { ...R, acaEnabled: true, acaEnhanced: true }],
    ['R aca employerCoversSpouse', { ...R, acaEnabled: true, retireAgeB: 58, employerCoversSpouseA: true, employerCoversSpouseB: false }],
    ['R irmaaPriorKnown', { ...R, ageA: 62, ageB: 61, retireAgeA: 62, retireAgeB: 61, irmaaPriorKnown: true, irmaaMagiPrior2: 250000, irmaaMagiPrior1: 300000 }],
    ['R ruleOf55', { ...R, ageA: 56, ageB: 54, retireAgeA: 56, retireAgeB: 54, ruleOf55A: true, ruleOf55B: true }],
    ['R sepp72tA', { ...R, sepp72tK401A: true }],
    ['R sepp72t both + ruleOf55', { ...R, sepp72tK401A: true, sepp72tK401B: true, ruleOf55A: true, ruleOf55B: true, traditionalSharePctA: 70 }],
    ['R bondYears0', { ...R, bondYears: 0 }],
    ['R bondYears8', { ...R, bondYears: 8 }],
    ['R work past 65', { ...R, ageA: 60, ageB: 58, retireAgeA: 68, retireAgeB: 66, lifeExpectancyA: 92, lifeExpectancyB: 92 }],
    ['R work past 65 single', { ...R, singlePerson: true, ageA: 60, retireAgeA: 69, lifeExpectancyA: 92 }],
    ['R work past 65 survivor', { ...R, ageA: 60, ageB: 58, retireAgeA: 68, retireAgeB: 66, lifeExpectancyA: 92, lifeExpectancyB: 92, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 67, survivorSpendingPct: 70 }],
    ['R bondYears3 working', { ...R, ageA: 45, ageB: 44, retireAgeA: 55, retireAgeB: 53, bondYears: 3 }],
    ['R guardrails', { ...R, guardrailsEnabled: true }],
    ['R survivor A', { ...R, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 80, survivorSpendingPct: 70 }],
    ['R survivor B', { ...R, survivorEnabled: true, survivorPartner: 'B', survivorDeathAge: 80, survivorSpendingPct: 70 }],
    ['R survivor+loans', { ...R, survivorEnabled: true, survivorDeathAge: 75, loans: LISTS.loans }],
    ['R marryLater', { ...R, filingStatus: 'single', marryLater: true, marriageAgeA: 56 }],
    ['R filing single', { ...R, filingStatus: 'single' }],
    ['R highIncome mfj', { ...R, incomeSources: HI_INCOME }],
    ['R highIncome filing single', { ...R, filingStatus: 'single', incomeSources: HI_INCOME }],
    ['R highIncome marryLater', { ...R, filingStatus: 'single', marryLater: true, marriageAgeA: 56, incomeSources: HI_INCOME }],
    ['R highIncome single person', { ...R, singlePerson: true, incomeSources: HI_INCOME }],
    ['R rent', { ...R, tenure: 'rent' }],
    ['R rentThenBuy', { ...R, tenure: 'rentThenBuy', buyAge: 56 }],
    ['R loans', { ...R, loans: LISTS.loans }],
    ['R incomeSources', { ...R, incomeSources: LISTS.incomeSources }],
    ['R incomeSources B wages', { ...R, incomeSources: [{ amount: 30000, startAge: 52, endAge: 60, followGrowth: true, growth: 3, owner: 'B', kind: 'wages' }] }],
    ['R incomeSources B other two returns', { ...R, filingStatus: 'single', incomeSources: [{ amount: 40000, startAge: 50, endAge: 70, followGrowth: true, growth: 3, owner: 'B', kind: 'other' }] }],
    ['R survivor streams', { ...R, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 58, incomeSources: [{ amount: 25000, startAge: 52, endAge: 65, followGrowth: true, growth: 3, owner: 'A', kind: 'wages' }, { amount: 15000, startAge: 52, endAge: 90, followGrowth: true, growth: 3, owner: 'A', kind: 'other' }] }],
    ['R stream contributions', { ...R, incomeSources: [{ amount: 60000, startAge: 52, endAge: 62, followGrowth: true, growth: 3, owner: 'A', kind: 'wages', contribute: true, deferralType: 'roth', deferralPct: 100, matchPct: 5, afterTaxPct: 50, personalPct: 100 }] }],
    ['R oneTimeIncome', { ...R, oneTimeIncome: LISTS.oneTimeIncome }],
    ['R extraExpenses', { ...R, extraExpenses: LISTS.extraExpenses }],
    ['R spendingTiers', { ...R, spendingTiers: LISTS.spendingTiers }],
    ['R lumpExpenses', { ...R, lumpExpenses: LISTS.lumpExpenses }],
    ['R all lists', { ...R, ...ALL_LISTS }],
    ['R ltc', { ...R, ltcEnabled: true }],
    ['R pension', { ...R, pensionCoverage: 'both', pensionYearlyA: 24000, pensionYearlyB: 12000, pensionStartAgeA: 60, pensionStartAgeB: 60 }],
    ['R medicalInflation4', { ...R, medicalInflation: 4 }],
    ['R state ca', { ...R, stateTax: 'ca' }],
    ['R state ny', { ...R, stateTax: 'ny' }],
    ['R state ma', { ...R, stateTax: 'ma' }],
    ['R zero growth', { ...R, returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0 }],
    ['R high dividends', { ...R, dividendYield: 3.5, qualifiedDivPct: 60 }],
    ['R depletes', { ...R, spending: 190000 }],
    ['R everything', {
      ...R, ...ALL_LISTS, withdrawalMixEnabled: true, smoothWithdrawals: true, guardrailsEnabled: true,
      rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 60, acaEnabled: true, ltcEnabled: true,
      ruleOf55A: true, ruleOf55B: true, sepp72tK401A: true, survivorEnabled: true, survivorDeathAge: 82,
    }],
  ].map(([name, patch]) => ({ name: 'std ' + name, kind: 'std', patch, shift: 0 }));
}

function caStd() {
  const D = {};
  const R = CA_R;
  return [
    ['default', D],
    ['default single', { ...D, singlePerson: true }],
    ['default rent', { ...D, tenure: 'rent' }],
    ['default rentThenBuy', { ...D, tenure: 'rentThenBuy' }],
    ['default guardrails', { ...D, guardrailsEnabled: true }],
    ['default fhsa', { ...D, fhsa: 30000, fhsaPctA: 50, fhsaPctB: 50 }],
    ['default tfsa contrib', { ...D, tfsaPctA: 40, tfsaPctB: 40 }],
    ['R', R],
    ['R single', { ...R, singlePerson: true }],
    ['R smooth', { ...R, smoothWithdrawals: true }],
    ['R meltdown', { ...R, meltdownEnabled: true, meltdownStartAge: 52, meltdownEndAge: 62, meltdownBracket: 20.5 }],
    ['R meltdown+split', { ...R, meltdownEnabled: true, meltdownStartAge: 52, meltdownEndAge: 62, pensionSplitEnabled: true, pensionCoverage: 'both', pensionYearlyA: 40000, pensionYearlyB: 5000, pensionStartAgeA: 55, pensionStartAgeB: 55 }],
    ['R pensionSplit', { ...R, pensionSplitEnabled: true, pensionCoverage: 'both', pensionYearlyA: 40000, pensionYearlyB: 5000, pensionStartAgeA: 55, pensionStartAgeB: 55 }],
    ['R oasClawback', { ...R, oasMonthlyA: 742, cppMonthlyA: 1400, pensionCoverage: 'both', pensionYearlyA: 90000, pensionStartAgeA: 60, traditional: 2000000 }],
    ['R bondYears0', { ...R, bondYears: 0 }],
    ['R bondYears8', { ...R, bondYears: 8 }],
    ['R bondYears3 working', { ...R, ageA: 45, ageB: 44, retireAgeA: 55, retireAgeB: 53, bondYears: 3 }],
    ['R guardrails', { ...R, guardrailsEnabled: true }],
    ['R survivor A', { ...R, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 80, survivorSpendingPct: 70 }],
    ['R survivor B', { ...R, survivorEnabled: true, survivorPartner: 'B', survivorDeathAge: 80, survivorSpendingPct: 70 }],
    ['R survivor+loans', { ...R, survivorEnabled: true, survivorDeathAge: 75, loans: LISTS.loans }],
    ['R death before retirement', { ...R, ageA: 60, ageB: 58, retireAgeA: 68, retireAgeB: 66, lifeExpectancyA: 92, lifeExpectancyB: 92, incomeA: 90000, incomeB: 60000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 64, survivorSpendingPct: 70 }],
    ['R rent', { ...R, tenure: 'rent' }],
    ['R rentThenBuy', { ...R, tenure: 'rentThenBuy', buyAge: 56 }],
    ['R loans', { ...R, loans: LISTS.loans }],
    ['R incomeSources', { ...R, incomeSources: LISTS.incomeSources }],
    ['R oneTimeIncome', { ...R, oneTimeIncome: LISTS.oneTimeIncome }],
    ['R extraExpenses', { ...R, extraExpenses: LISTS.extraExpenses }],
    ['R spendingTiers', { ...R, spendingTiers: LISTS.spendingTiers }],
    ['R lumpExpenses', { ...R, lumpExpenses: LISTS.lumpExpenses }],
    ['R all lists', { ...R, ...ALL_LISTS }],
    ['R ltc', { ...R, ltcEnabled: true }],
    ['R pension', { ...R, pensionCoverage: 'both', pensionYearlyA: 24000, pensionYearlyB: 12000, pensionStartAgeA: 60, pensionStartAgeB: 60 }],
    ['R medicalInflation4', { ...R, medicalInflation: 4 }],
    ['R province bc', { ...R, province: 'bc' }],
    ['R province qc', { ...R, province: 'qc' }],
    ['R province ab', { ...R, province: 'ab' }],
    // 7M: provinces with property-tax and rent programs (owner with 4,000 property tax; Manitoba renter; low-income retired owners).
    ['R province mb owner', { ...R, province: 'mb', propertyTax: 4000 }],
    ['R province mb renter', { ...R, province: 'mb', tenure: 'rent', rent: 2000 }],
    ['R province ns owner', { ...R, province: 'ns', propertyTax: 4000 }],
    ['R province nb owner', { ...R, province: 'nb', propertyTax: 4000 }],
    ['R province ns low-income retirees', { ...R, province: 'ns', ageA: 68, ageB: 66, retireAgeA: 68, retireAgeB: 66, taxable: 0, traditional: 150000, roth: 100000, cash: 20000, spending: 30000, propertyTax: 3000 }],
    // 7M: the child benefits, credits and seniors programs of SK, MB, NS, NB, NL and PEI (clock pinned to 2026: children born 2022 and 2016; a low-income retired couple so the income-tested programs pay).
    ['R province sk family', { ...R, province: 'sk', ageA: 40, ageB: 38, retireAgeA: 40, retireAgeB: 38, taxable: 0, traditional: 150000, roth: 50000, cash: 20000, spending: 30000, children: [{ birthYear: 2022, student: false }, { birthYear: 2016, student: false }] }],
    ['R province mb family', { ...R, province: 'mb', ageA: 40, ageB: 38, retireAgeA: 40, retireAgeB: 38, taxable: 0, traditional: 150000, roth: 50000, cash: 20000, spending: 30000, children: [{ birthYear: 2022, student: false }, { birthYear: 2016, student: false }] }],
    ['R province ns family', { ...R, province: 'ns', ageA: 40, ageB: 38, retireAgeA: 40, retireAgeB: 38, taxable: 0, traditional: 150000, roth: 50000, cash: 20000, spending: 30000, children: [{ birthYear: 2022, student: false }, { birthYear: 2016, student: false }] }],
    ['R province nb family', { ...R, province: 'nb', ageA: 40, ageB: 38, retireAgeA: 40, retireAgeB: 38, taxable: 0, traditional: 150000, roth: 50000, cash: 20000, spending: 30000, children: [{ birthYear: 2022, student: false }, { birthYear: 2016, student: false }] }],
    ['R province nl family', { ...R, province: 'nl', ageA: 40, ageB: 38, retireAgeA: 40, retireAgeB: 38, taxable: 0, traditional: 150000, roth: 50000, cash: 20000, spending: 30000, children: [{ birthYear: 2022, student: false }, { birthYear: 2016, student: false }] }],
    ['R province pe family', { ...R, province: 'pe', ageA: 40, ageB: 38, retireAgeA: 40, retireAgeB: 38, taxable: 0, traditional: 150000, roth: 50000, cash: 20000, spending: 30000, children: [{ birthYear: 2022, student: false }, { birthYear: 2016, student: false }] }],
    ['R province sk low-income retirees', { ...R, province: 'sk', ageA: 68, ageB: 66, retireAgeA: 68, retireAgeB: 66, taxable: 0, traditional: 0, roth: 400000, cash: 20000, spending: 24000, cppMonthlyA: 150, cppMonthlyB: 150 }],
    ['R province nl low-income retirees', { ...R, province: 'nl', ageA: 68, ageB: 66, retireAgeA: 68, retireAgeB: 66, taxable: 0, traditional: 0, roth: 400000, cash: 20000, spending: 24000, cppMonthlyA: 150, cppMonthlyB: 150 }],
    ['R province pe retirees', { ...R, province: 'pe', ageA: 68, ageB: 66, retireAgeA: 68, retireAgeB: 66, taxable: 0, traditional: 0, roth: 400000, cash: 20000, spending: 24000, cppMonthlyA: 150, cppMonthlyB: 150 }],
    ['R province mb 55 PLUS early retirees', { ...R, province: 'mb', ageA: 58, ageB: 56, retireAgeA: 58, retireAgeB: 56, taxable: 0, traditional: 100000, roth: 20000, cash: 10000, spending: 20000 }],
    ['R province nb low-income retirees', { ...R, province: 'nb', ageA: 68, ageB: 66, retireAgeA: 68, retireAgeB: 66, taxable: 0, traditional: 150000, roth: 100000, cash: 20000, spending: 30000, propertyTax: 3000 }],
    ['R zero growth', { ...R, returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0 }],
    ['R high dividends', { ...R, dividendYield: 4, qualifiedDivPct: 60 }],
    ['R fhsa', { ...R, fhsa: 40000 }],
    ['R depletes', { ...R, spending: 170000 }],
    ['R everything', {
      ...R, ...ALL_LISTS, smoothWithdrawals: true, guardrailsEnabled: true, meltdownEnabled: true,
      meltdownStartAge: 52, meltdownEndAge: 62, pensionSplitEnabled: true, pensionCoverage: 'both',
      pensionYearlyA: 30000, pensionYearlyB: 10000, pensionStartAgeA: 55, pensionStartAgeB: 55,
      ltcEnabled: true, survivorEnabled: true, survivorDeathAge: 82,
    }],
  ].map(([name, patch]) => ({ name: 'std ' + name, kind: 'std', patch, shift: 0 }));
}

// The +/-1yr and +/-3yr comparison paths shift both retirement ages.
function shifts(std) {
  const out = [];
  for (const base of std.filter((s) => s.name === 'std default' || s.name === 'std R bondYears3 working'))
    for (const shift of [-3, -1, 1, 3])
      out.push({ ...base, name: `${base.name} shift${shift > 0 ? '+' : ''}${shift}`, shift });
  return out;
}

const SERIES = [
  { id: 'real1929', type: 'real', start: 1929 },
  { id: 'real1966', type: 'real', start: 1966 },
  { id: 'real1973', type: 'real', start: 1973 },
  { id: 'real2000', type: 'real', start: 2000 },
  { id: 'crashFirst', type: 'crashFirst' },
  { id: 'sawtooth', type: 'sawtooth' },
  { id: 'boom', type: 'boom' },
  { id: 'flat', type: 'flat' },
  { id: 'mc1', type: 'mc', seed: 1 },
  { id: 'mc2', type: 'mc', seed: 2 },
];

// Real crash-era paths exhaust the plain R portfolio in the 60s-70s, before
// survivor / late-life / RMD logic is reached, so every non-default historical
// scenario is also run with a portfolio rich enough to last the whole path.
const RICH = { taxable: 1600000, traditional: 2400000, roth: 600000, cash: 90000 };

function histGrid(std, names, seriesIds) {
  const out = [];
  for (const s of std.filter((x) => names.includes(x.name.replace(/^std /, ''))))
    for (const rich of s.name === 'std default' ? [false] : [false, true])
      for (const series of SERIES.filter((x) => !seriesIds || seriesIds.includes(x.id)))
        out.push({
          name: `hist ${s.name.replace(/^std /, '')}${rich ? ' rich' : ''} | ${series.id}`,
          kind: 'hist',
          patch: rich ? { ...s.patch, ...RICH } : s.patch,
          series,
        });
  return out;
}

// Batch 3C (8.0): households where the cliff guard acts with Roth conversions on (US only; no Canada
// equivalent). Conversions run from the retirement age to 72 at the 22% bracket, ACA on (enhanced credits
// off), Texas, life expectancy 95. Together they cover an IRMAA line, the ACA 400% line, the senior-deduction
// and child-credit phase-outs, in the default and the smooth withdrawal modes, for MFJ, two single returns,
// a single person and a head of household, in the standard engine and (bucket engine) on the 1929, 1966 and
// 1973 starts. Every one of them labels at least one year with a cliffChoice at the commit that added them.
const GUARD_CONV = { acaEnabled: true, acaEnhanced: false, stateTax: 'tx', lifeExpectancyA: 95, lifeExpectancyB: 95,
  withdrawalMixEnabled: false, rothConvEnabled: true, rothConvBracket: 22, ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false };
const gHousehold = (filing, age, trad, taxable, spending, smooth, extra = {}) => ({
  ...GUARD_CONV,
  ...(filing === 'mfj' ? { singlePerson: false, filingStatus: 'mfj' } : filing === 'two' ? { singlePerson: false, filingStatus: 'single' } : { singlePerson: true }),
  children: filing === 'hoh' ? [{ birthYear: 2016, student: false }] : [],
  ageA: age, ageB: age, retireAgeA: age, retireAgeB: age,
  rothConvStartAge: age, rothConvEndAge: Math.max(age, 72),
  taxable, spending, smoothWithdrawals: smooth,
  traditional: trad, roth: 200000,
  ...extra,
});
// The 1966 head-of-household household: one child born 2016, 1.5M in Partner A's 401(k), 300k taxable,
// 200k Roth IRA (basis not entered), spending 130k, conversions 66-72.
const H1966 = { ...GUARD_CONV, singlePerson: true, children: [{ birthYear: 2016, student: false }],
  ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, taxable: 300000, spending: 130000, smoothWithdrawals: false,
  rothConvStartAge: 66, rothConvEndAge: 72,
  tradIraA: 0, tradIraB: 0, trad401kA: 1500000, trad401kB: 0, rothIraA: 200000, rothIraB: 0, roth401kA: 0, roth401kB: 0,
  rothIraBasisA: 0, rothIraBasisB: 0 };

function usGuard() {
  const std = [
    ['G hoh 66 1966 household', H1966],
    ['G hoh 66 1966 household smooth', { ...H1966, smoothWithdrawals: true }],
    ['G mfj 66 250k+250k 300k 130k smooth', gHousehold('mfj', 66, 500000, 300000, 130000, true)],
    ['G single 66 500k 300k 60k smooth', gHousehold('single', 66, 500000, 300000, 60000, true)],
    ['G single 66 500k 300k 130k smooth', gHousehold('single', 66, 500000, 300000, 130000, true)],
    ['G mfj 62 aca 400% default', gHousehold('mfj', 62, 1500000, 300000, 60000, false)],
    ['G mfj 62 aca 400% smooth', gHousehold('mfj', 62, 1500000, 300000, 60000, true)],
    ['G two returns 62 aca smooth', gHousehold('two', 62, 1500000, 300000, 60000, true)],
    ['G two returns 66 irmaa default', gHousehold('two', 66, 1500000, 300000, 130000, false)],
    ['G two returns 66 irmaa smooth', gHousehold('two', 66, 500000, 300000, 130000, true)],
    ['G hoh 58 aca smooth', gHousehold('hoh', 58, 1500000, 300000, 60000, true)],
    ['G single 62 aca smooth', gHousehold('single', 62, 1500000, 300000, 60000, true)],
    ['G mfj 58 aca default', gHousehold('mfj', 58, 1500000, 300000, 60000, false)],
    ['G single 58 aca default', gHousehold('single', 58, 1500000, 300000, 60000, false)],
    ['G hoh 62 aca default', gHousehold('hoh', 62, 1500000, 300000, 60000, false)],
    ['G hoh 62 aca smooth', gHousehold('hoh', 62, 1500000, 300000, 60000, true)],
    ['G hoh 66 irmaa 500k smooth', gHousehold('hoh', 66, 500000, 300000, 130000, true)],
  ].map(([name, patch]) => ({ name: 'std ' + name, kind: 'std', patch, shift: 0 }));
  const hist = [
    ['hist G hoh 66 1966 household | real1929', H1966, 'real1929'],
    ['hist G hoh 66 1966 household | real1966', H1966, 'real1966'],
    ['hist G hoh 66 1966 household | real1973', H1966, 'real1973'],
    ['hist G mfj 62 aca 400% smooth | real1966', gHousehold('mfj', 62, 1500000, 300000, 60000, true), 'real1966'],
    ['hist G mfj 58 aca default | real1966', gHousehold('mfj', 58, 1500000, 300000, 60000, false), 'real1966'],
    ['hist G hoh 58 aca smooth | real1973', gHousehold('hoh', 58, 1500000, 300000, 60000, true), 'real1973'],
    ['hist G single 58 aca default | real1966', gHousehold('single', 58, 1500000, 300000, 60000, false), 'real1966'],
    ['hist G hoh 62 aca default | real1966', gHousehold('hoh', 62, 1500000, 300000, 60000, false), 'real1966'],
  ].map(([name, patch, id]) => ({ name, kind: 'hist', patch, series: SERIES.find((x) => x.id === id) }));
  return [...std, ...hist];
}

function scenarios(isUS) {
  const std = isUS ? usStd() : caStd();
  const histNames = isUS
    ? ['default', 'R', 'R single', 'R smooth', 'R mixLive', 'R mixApplied', 'R rothSchedule', 'R rothConv+aca', 'R aca', 'R guardrails',
       'R survivor A', 'R bondYears0', 'R bondYears8', 'R bondYears3 working', 'R work past 65', 'R work past 65 survivor', 'R loans', 'R lumpExpenses', 'R rentThenBuy',
       'R ruleOf55', 'R sepp72t both + ruleOf55', 'R all lists', 'R everything']
    : ['default', 'R', 'R single', 'R smooth', 'R meltdown+split', 'R guardrails', 'R survivor A',
       'R bondYears0', 'R bondYears8', 'R bondYears3 working', 'R loans', 'R lumpExpenses', 'R rentThenBuy', 'R fhsa', 'R all lists', 'R everything'];
  return [...std, ...shifts(std), ...histGrid(std, histNames), ...(isUS ? usGuard() : [])];
}

module.exports = { scenarios };
