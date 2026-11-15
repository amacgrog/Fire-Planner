// Canada guidance goals: the goals, the fields each brings in, and each field's realistic error

  const RETIRE_FIELDS = [
    'cppMonthlyA', 'cppMonthlyB', 'cppStartAgeA', 'cppStartAgeB', 'oasMonthlyA', 'oasMonthlyB', 'oasStartAgeA', 'oasStartAgeB',
    'pensionYearlyA', 'pensionYearlyB', 'pensionStartAgeA', 'pensionStartAgeB', 'healthcare',
  ];
  const HOUSE_FIELDS = [
    'mortgage', 'mortgageRate', 'mortgageYears', 'mortgagePrincipal', 'maintenance', 'propertyTax', 'homeInsurance', 'rent',
  ];
  // load-time: freezes the table's own literals and the constants above; reads nothing another statement writes.
  export const GOALS = Object.freeze([
    { key: 'retire', label: 'When can I retire?', fields: RETIRE_FIELDS, critical: [], feature: null, couples: false },
    { key: 'spend', label: 'How much can I spend?', fields: [...RETIRE_FIELDS, ...HOUSE_FIELDS], critical: [], feature: null, couples: false },
    {
      key: 'convert',
      label: 'Should I do an RRSP meltdown?',
      fields: ['traditional', 'oasMonthlyA', 'oasMonthlyB'],
      critical: ['province'],
      feature: 'meltdownEnabled',
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
        'cppMonthlyA', 'cppMonthlyB',
      ],
      critical: [],
      feature: null,
      couples: true,
    },
    {
      key: 'legacy',
      label: 'What I leave behind',
      fields: ['lifeExpectancyA', 'lifeExpectancyB', 'homeValue', 'traditional'],
      critical: ['province'],
      feature: null,
      couples: false,
    },
  ].map((g) => Object.freeze(g)));
  // load-time: derived from GOALS above, which this file declares.
  export const GOAL_KEYS = GOALS.map((g) => g.key);
  export const BASIC_IDS = [
    'ageA', 'ageB', 'retireAgeA', 'retireAgeB', 'incomeA', 'incomeB', 'spending', 'taxable', 'cash', 'traditional', 'roth',
  ];
  export const CRITICAL = {
    province: { reason: 'Sets the provincial tax on withdrawals, the meltdown and the estate.', when: () => true },
  };
  export const IMPACT_KIND = {
    age: [
      'ageA', 'ageB', 'retireAgeA', 'retireAgeB', 'lifeExpectancyA', 'lifeExpectancyB', 'pensionStartAgeA', 'pensionStartAgeB',
      'ltcAgeA', 'ltcAgeB', 'survivorDeathAge', 'buyAge', 'meltdownStartAge', 'meltdownEndAge', 'mortgageYears', 'buyTerm',
    ],
    rate: ['mortgageRate', 'matchA', 'matchB', 'buyClosingPct', 'tfsaPctA', 'tfsaPctB', 'fhsaPctA', 'fhsaPctB'],
    share: ['basisRatio', 'survivorSpendingPct', 'buyDownPct', 'rrspPctA', 'rrspPctB'],
  };
  export const IMPACT_BOUNDS = {
    mortgageYears: [1, 40],
    buyTerm: [1, 40],
  };
  export const NO_FIGURE = ['cppStartAgeA', 'cppStartAgeB', 'oasStartAgeA', 'oasStartAgeB'];
  export const CHOICE_ESTIMATE_IDS = ['province'];
