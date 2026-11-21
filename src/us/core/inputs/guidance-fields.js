// US guidance goals: the goals, the fields each brings in, and each field's realistic error

  const RETIRE_FIELDS = [
    'ssMonthlyA', 'ssMonthlyB', 'ssStartAgeA', 'ssStartAgeB', 'ssSurvivorMonthlyFra', 'pensionYearlyA', 'pensionYearlyB',
    'pensionStartAgeA', 'pensionStartAgeB', 'healthcare',
  ];
  const BASIS_CRITICAL = ['rothIraBasisA', 'rothIraBasisB', 'roth401kBasisPctA', 'roth401kBasisPctB'];
  const HOUSE_FIELDS = [
    'mortgage', 'mortgageRate', 'mortgageYears', 'mortgagePrincipal', 'maintenance', 'propertyTax', 'homeInsurance', 'rent',
  ];
  // load-time: freezes the table's own literals and the constants above; reads nothing another statement writes.
  export const GOALS = Object.freeze([
    { key: 'retire', label: 'When can I retire?', fields: RETIRE_FIELDS, critical: BASIS_CRITICAL, feature: null, couples: false },
    {
      key: 'spend',
      label: 'How much can I spend?',
      fields: [...RETIRE_FIELDS, ...HOUSE_FIELDS, 'medicareYearly'],
      critical: BASIS_CRITICAL,
      feature: null,
      couples: false,
    },
    {
      key: 'convert',
      label: 'Should I do Roth conversions?',
      fields: ['trad401kA', 'trad401kB', 'tradIraA', 'tradIraB', 'ssMonthlyA', 'ssMonthlyB', 'ssSurvivorMonthlyFra'],
      critical: ['stateTax', 'rothIraBasisA', 'rothIraBasisB'],
      feature: 'rothConvEnabled',
      couples: false,
    },
    {
      key: 'aca',
      label: 'Health cover before Medicare',
      fields: ['healthcare', 'basisRatio', 'taxable', 'pensionYearlyA', 'pensionYearlyB', 'pensionStartAgeA', 'pensionStartAgeB'],
      critical: [],
      feature: 'acaEnabled',
      couples: false,
    },
    {
      key: 'house',
      label: 'Buy, rent or pay off the house',
      fields: [
        'homeValue', 'mortgagePrincipal', 'mortgage', 'mortgageRate', 'mortgageYears', 'extraPrincipal', 'maintenance',
        'propertyTax', 'homeInsurance', 'rent', 'buyAge', 'buyDownPct', 'buyClosingPct', 'buyTerm', 'buyExtraPrincipal',
      ],
      critical: [],
      feature: null,
      couples: false,
    },
    {
      key: 'survivor',
      label: 'What if one of us dies early?',
      fields: [
        'lifeExpectancyA', 'lifeExpectancyB', 'pensionYearlyA', 'pensionYearlyB', 'survivorDeathAge', 'survivorSpendingPct',
        'ssMonthlyA', 'ssMonthlyB',
      ],
      critical: [],
      feature: null,
      couples: true,
    },
    {
      key: 'legacy',
      label: 'What I leave behind',
      fields: ['lifeExpectancyA', 'lifeExpectancyB', 'homeValue', 'trad401kA', 'trad401kB', 'tradIraA', 'tradIraB'],
      critical: ['stateTax'],
      feature: null,
      couples: false,
    },
  ].map((g) => Object.freeze(g)));
  // load-time: derived from GOALS above, which this file declares.
  export const GOAL_KEYS = GOALS.map((g) => g.key);
  export const BASIC_IDS = [
    'ageA', 'ageB', 'retireAgeA', 'retireAgeB', 'incomeA', 'incomeB', 'spending', 'taxable', 'cash',
    'trad401kA', 'trad401kB', 'tradIraA', 'tradIraB', 'roth401kA', 'roth401kB', 'rothIraA', 'rothIraB',
  ];
  const basisWhen = (acct, p) => (s) => s[acct + p] > 0 && s['retireAge' + p] < 60 && (p === 'A' || !s.singlePerson);
  // load-time: basisWhen only builds closures; nothing runs until a state is passed in.
  export const CRITICAL = {
    rothIraBasisA: { reason: "Decides how much of Partner A's Roth IRA can be reached before 59½.", when: basisWhen('rothIra', 'A') },
    rothIraBasisB: { reason: "Decides how much of Partner B's Roth IRA can be reached before 59½.", when: basisWhen('rothIra', 'B') },
    roth401kBasisPctA: { reason: "Decides how much of Partner A's Roth 401(k) can be reached before 59½.", when: basisWhen('roth401k', 'A') },
    roth401kBasisPctB: { reason: "Decides how much of Partner B's Roth 401(k) can be reached before 59½.", when: basisWhen('roth401k', 'B') },
    stateTax: { reason: 'Sets the state tax on every withdrawal and conversion.', when: () => true },
  };
  export const IMPACT_KIND = {
    age: [
      'ageA', 'ageB', 'retireAgeA', 'retireAgeB', 'lifeExpectancyA', 'lifeExpectancyB', 'pensionStartAgeA', 'pensionStartAgeB',
      'ltcAgeA', 'ltcAgeB', 'survivorDeathAge', 'buyAge', 'marriageAgeA', 'rothConvStartAge', 'rothConvEndAge', 'mortgageYears', 'buyTerm',
    ],
    rate: ['mortgageRate', 'matchA', 'matchB', 'buyClosingPct', 'profitSharingPctA', 'profitSharingPctB'],
    share: [
      'basisRatio', 'survivorSpendingPct', 'buyDownPct', 'roth401kBasisPctA', 'roth401kBasisPctB',
      'k401PctA', 'k401PctB', 'iraPctA', 'iraPctB', 'megaPctA', 'megaPctB',
    ],
  };
  export const IMPACT_BOUNDS = {
    mortgageYears: [1, 40],
    buyTerm: [1, 40],
    profitSharingPctA: [0, 25],
    profitSharingPctB: [0, 25],
  };
  export const NO_FIGURE = ['ssStartAgeA', 'ssStartAgeB'];
  export const CHOICE_ESTIMATE_IDS = ['stateTax'];
