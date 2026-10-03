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
    ['R ruleOf55', { ...R, ageA: 56, ageB: 54, retireAgeA: 56, retireAgeB: 54, ruleOf55Enabled: true }],
    ['R sepp72tA', { ...R, sepp72tEnabledA: true }],
    ['R sepp72t both + ruleOf55', { ...R, sepp72tEnabledA: true, sepp72tEnabledB: true, ruleOf55Enabled: true, traditionalSharePctA: 70 }],
    ['R bondYears0', { ...R, bondYears: 0 }],
    ['R bondYears8', { ...R, bondYears: 8 }],
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
      ruleOf55Enabled: true, sepp72tEnabledA: true, survivorEnabled: true, survivorDeathAge: 82,
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

function scenarios(isUS) {
  const std = isUS ? usStd() : caStd();
  const histNames = isUS
    ? ['default', 'R', 'R single', 'R smooth', 'R mixLive', 'R mixApplied', 'R rothSchedule', 'R rothConv+aca', 'R aca', 'R guardrails',
       'R survivor A', 'R bondYears0', 'R bondYears8', 'R loans', 'R lumpExpenses', 'R rentThenBuy',
       'R ruleOf55', 'R sepp72t both + ruleOf55', 'R all lists', 'R everything']
    : ['default', 'R', 'R single', 'R smooth', 'R meltdown+split', 'R guardrails', 'R survivor A',
       'R bondYears0', 'R bondYears8', 'R loans', 'R lumpExpenses', 'R rentThenBuy', 'R fhsa', 'R all lists', 'R everything'];
  return [...std, ...shifts(std), ...histGrid(std, histNames)];
}

module.exports = { scenarios };
