// The FIELDS registry: every sidebar control that maps onto a state key

import { clampRetireAgeA, clampRetireAgeB } from '../../../shared/core/inputs/clamps.js';
import { money } from '../../../shared/core/format/numbers.js';
import { state } from '../../../shared/core/store.js';
import { clampLifeExpectancyA, clampLifeExpectancyB } from '../../core/inputs/list-rules.js';
import { defaults } from '../../core/inputs/defaults.js';
import { clampSsBenefitCutPct, ssBenefitCutYear } from '../../core/inputs/ss-benefit-cut.js';
import { clampFedRateChangePct, fedRateYear } from '../../core/inputs/fed-rate-change.js';
import { clampSsStartAges } from '../../core/inputs/ss-start-age.js';

  // Employer profit sharing, % of pay, strictly 0 to 25; the box is rewritten only when the typed value was out of range.
  const clampProfitSharing = (key) => {
    const v = Math.min(25, Math.max(0, state[key]));
    if (v !== state[key]) {
      state[key] = v;
      document.getElementById(key).value = v;
    }
  };
  export const FIELDS = [
    { key: 'ageA', type: 'number', resync: true, onInput: () => { clampRetireAgeA(); clampLifeExpectancyA(); } },
    { key: 'ageB', type: 'number', resync: true, onInput: () => { clampRetireAgeB(); clampLifeExpectancyB(); } },
    { key: 'lifeExpectancyA', type: 'number', out: (v) => `Age ${v}`, outSync: 'controls', resync: true, onInput: () => { clampLifeExpectancyA(); } },
    { key: 'lifeExpectancyB', type: 'number', out: (v) => `Age ${v}`, outSync: 'controls', resync: true, onInput: () => { clampLifeExpectancyB(); } },
    { key: 'retireAgeA', type: 'number', out: (v) => `Age ${v}`, outSync: 'controls', resync: true },
    { key: 'retireAgeB', type: 'number', out: (v) => `Age ${v}`, outSync: 'controls', resync: true },
    { key: 'incomeA', type: 'number' },
    { key: 'incomeB', type: 'number' },
    { key: 'matchA', type: 'number' },
    { key: 'matchB', type: 'number' },
    { key: 'profitSharingPctA', type: 'number', min: 0, max: 25, onInput: () => clampProfitSharing('profitSharingPctA') },
    { key: 'profitSharingPctB', type: 'number', min: 0, max: 25, onInput: () => clampProfitSharing('profitSharingPctB') },
    { key: 'k401PctA', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'k401PctB', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'catchupPctA', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'catchupPctB', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'iraPctA', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'iraPctB', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'megaPctA', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'megaPctB', type: 'number', out: (v) => `${v}%`, outSync: 'contrib', syncAfter: 'contrib' },
    { key: 'spending', type: 'number' },
    { key: 'incomeGrowth', type: 'number' },
    { key: 'inflation', type: 'number' },
    { key: 'medicalInflation', type: 'number' },
    { key: 'taxable', type: 'number' },
    { key: 'basisRatio', type: 'number', out: (v) => `${v}%`, outSync: 'controls', inlineOut: true },
    { key: 'tradIraA', type: 'number' },
    { key: 'trad401kA', type: 'number' },
    { key: 'rothIraA', type: 'number' },
    { key: 'roth401kA', type: 'number' },
    { key: 'tradIraB', type: 'number' },
    { key: 'trad401kB', type: 'number' },
    { key: 'rothIraB', type: 'number' },
    { key: 'roth401kB', type: 'number' },
    { key: 'rothIraBasisA', type: 'number' },
    { key: 'rothIraBasisB', type: 'number' },
    { key: 'roth401kBasisPctA', type: 'number', out: (v) => `${v}%`, outSync: 'controls', inlineOut: true },
    { key: 'roth401kBasisPctB', type: 'number', out: (v) => `${v}%`, outSync: 'controls', inlineOut: true },
    { key: 'tradIraBasisPctA', type: 'number', out: (v) => `${v}%`, outSync: 'controls', inlineOut: true, mcp: true, min: 0, max: 100 },
    { key: 'tradIraBasisPctB', type: 'number', out: (v) => `${v}%`, outSync: 'controls', inlineOut: true, mcp: true, min: 0, max: 100 },
    { key: 'cash', type: 'number' },
    { key: 'cashReserve', type: 'number', out: (v) => money(v), outSync: 'controls', resync: true },
    { key: 'bondYears', type: 'number' },
    { key: 'bridgeBondYears', type: 'number' },
    { key: 'bondTradPct', type: 'number', out: (v) => `${v}% traditional`, outSync: 'controls', inlineOut: true, mcp: true, min: 0, max: 100 },
    { key: 'bondStart', type: 'choice', manual: true, values: ['build', 'held'], fallback: 'build', mcp: true },
    { key: 'returnRate', type: 'number' },
    { key: 'bondReturn', type: 'number' },
    { key: 'hysaRate', type: 'number' },
    { key: 'dividendYield', type: 'number' },
    { key: 'qualifiedDivPct', type: 'number' },
    { key: 'homeValue', type: 'number' },
    { key: 'homeGrowth', type: 'number' },
    { key: 'mortgagePrincipal', type: 'number' },
    { key: 'mortgage', type: 'number' },
    { key: 'mortgageRate', type: 'number' },
    { key: 'mortgageYears', type: 'number' },
    { key: 'extraPrincipal', type: 'number', out: (v) => `+${money(v)}/mo`, outSync: 'controls', resync: true },
    { key: 'maintenance', type: 'number' },
    { key: 'propertyTax', type: 'number' },
    { key: 'propertyTaxGrowth', type: 'number' },
    { key: 'homeInsurance', type: 'number' },
    { key: 'homeInsuranceGrowth', type: 'number' },
    { key: 'rent', type: 'number' },
    { key: 'rentGrowth', type: 'number' },
    { key: 'ssMonthlyA', type: 'number' },
    // The start ages' MCP limits: 62 to SS_START_AGE_MAX_LAW_CHANGE (a literal: FIELDS is a load-time literal); the switch's own
    // limit is applied by clampSsStartAges.
    { key: 'ssStartAgeA', type: 'number', min: 62, max: 75, resync: true, onInput: () => clampSsStartAges(state) },
    { key: 'ssMonthlyB', type: 'number' },
    { key: 'ssStartAgeB', type: 'number', min: 62, max: 75, resync: true, onInput: () => clampSsStartAges(state) },
    // Feedback B2: the benefit cut, 0-100 (clamped on typing), and its start year, whose MCP limits are SS_BENEFIT_CUT_YEAR_MIN/MAX
    // (literals: FIELDS is a load-time literal); the year is rounded and clamped on `change` and on load, not while typing. Its
    // `onChange` runs only after an MCP write (a number box's listener runs `onInput`); the box's `change` is wired in
    // ss-benefit-cut-button.js, which also reads a blank box as the default.
    { key: 'ssBenefitCutPct', type: 'number', min: 0, max: 100, resync: true, onInput: () => clampSsBenefitCutPct(state) },
    { key: 'ssBenefitCutStartYear', type: 'number', min: 2000, max: 2200, onChange: () => { state.ssBenefitCutStartYear = ssBenefitCutYear(state.ssBenefitCutStartYear, defaults.ssBenefitCutStartYear); } },
    // Feedback C2: the federal rate change, FED_RATE_PCT_MIN/MAX (-50 to 50, clamped on typing), and its start year,
    // FED_RATE_YEAR_MIN/MAX, settled as B2's (the box's `change` is wired in fed-rate-change-button.js; `onChange` runs after MCP).
    { key: 'fedRateChangePct', type: 'number', min: -50, max: 50, resync: true, onInput: () => clampFedRateChangePct(state) },
    { key: 'fedRateChangeYear', type: 'number', min: 2000, max: 2200, onChange: () => { state.fedRateChangeYear = fedRateYear(state.fedRateChangeYear, defaults.fedRateChangeYear); } },
    // SS claiming optimizer PR 2: a widowed single person's survivor benefit (the quote age's limits are SSA's 60 to the survivor
    // full retirement age, 67 at most; the engine clamps what it reads, and normalizeState on load).
    { key: 'ssSurvivorMonthlyFra', type: 'number' },
    { key: 'ssSurvivorQuoteMonthly', type: 'number' },
    { key: 'ssSurvivorQuoteAge', type: 'number', min: 60, max: 67 },
    { key: 'pensionYearlyA', type: 'number' },
    { key: 'pensionStartAgeA', type: 'number' },
    { key: 'pensionYearlyB', type: 'number' },
    { key: 'pensionStartAgeB', type: 'number' },
    { key: 'healthPremiumA', type: 'number' },
    { key: 'healthPremiumB', type: 'number' },
    { key: 'healthcare', type: 'number' },
    { key: 'medicareYearly', type: 'number' },
    { key: 'irmaaMagiPrior2', type: 'number' },
    { key: 'irmaaMagiPrior1', type: 'number' },
    { key: 'ltcYearlyA', type: 'number' },
    { key: 'ltcAgeA', type: 'number' },
    { key: 'ltcYearlyB', type: 'number' },
    { key: 'ltcAgeB', type: 'number' },
    { key: 'marriageAgeA', type: 'number' },
    { key: 'survivorDeathAge', type: 'number' },
    { key: 'survivorSpendingPct', type: 'number' },
    { key: 'rothConvStartAge', type: 'number' },
    { key: 'rothConvEndAge', type: 'number' },
    { key: 'sepp72tIraAgeA', type: 'number' },
    { key: 'sepp72tK401AgeA', type: 'number' },
    { key: 'sepp72tIraAgeB', type: 'number' },
    { key: 'sepp72tK401AgeB', type: 'number' },
    { key: 'buyAge', type: 'number' },
    { key: 'buyDownPct', type: 'number', out: (v) => `${v}%`, outSync: 'controls', resync: true },
    { key: 'buyClosingPct', type: 'number', out: (v) => `${v}%`, outSync: 'controls', resync: true },
    { key: 'buyTerm', type: 'number' },
    { key: 'buyExtraPrincipal', type: 'number', out: (v) => `+${money(v)}/mo`, outSync: 'controls', resync: true },
    // Checkboxes, selects and choices. `sync` says which sync function owns the control's DOM
    // ('controls' | 'contrib'); `resync` lists the sync functions its listener runs; `reveals` are
    // the elements it shows/hides; `mirrors` are the wizard checkboxes that follow it; `manual`
    // marks button groups that are wired by hand (still registered for MCP and normalizeState);
    // `mcp` exposes it through the update_fire_assumptions tool. MCP order = order below.
    { key: 'singlePerson', type: 'bool', sync: 'controls', resync: ['controls', 'contrib'], mirrors: ['wizardSinglePerson'], mcp: true },
    { key: 'megaBackdoor', type: 'bool', sync: 'contrib', resync: ['contrib'], reveals: [{ id: 'megaAField', hidden: (s) => !s.megaBackdoor }, { id: 'megaBField', hidden: (s) => !s.megaBackdoor || s.singlePerson }], mcp: true },
    { key: 'ltcEnabled', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'ltcFields', hidden: (s) => !s.ltcEnabled }], mcp: true },
    { key: 'acaEnabled', type: 'bool', sync: 'contrib', resync: ['contrib'], reveals: [{ id: 'acaEnhancedField', hidden: (s) => !s.acaEnabled }, { id: 'medicaidWhenEligibleField', hidden: (s) => !s.acaEnabled }], mcp: true },
    { key: 'medicaidWhenEligible', type: 'bool', sync: 'contrib', resync: [], trueUnlessFalse: true, mcp: true },
    { key: 'irmaaPriorKnown', type: 'bool', sync: 'contrib', resync: ['contrib'], reveals: [{ id: 'irmaaPriorFields', hidden: (s) => !s.irmaaPriorKnown }], mcp: true },
    { key: 'employerCoversSpouseA', type: 'bool', sync: 'controls', resync: [], trueUnlessFalse: true, mcp: true },
    { key: 'employerCoversSpouseB', type: 'bool', sync: 'controls', resync: [], trueUnlessFalse: true, mcp: true },
    { key: 'rothConvEnabled', type: 'bool', sync: 'contrib', resync: ['contrib'], mcp: true },
    { key: 'withdrawalMixEnabled', type: 'bool', sync: 'controls', resync: [], mcp: true },
    { key: 'cliffGuardEnabled', type: 'bool', sync: 'controls', resync: [], trueUnlessFalse: true, mcp: true },
    // Feedback C2: whether the federal rate change also scales the gain rates (ticked by default); 'controls' redraws the summary.
    { key: 'fedRateChangeGains', type: 'bool', sync: 'controls', resync: ['controls'], trueUnlessFalse: true, mcp: true },
    { key: 'ruleOf55A', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tK401ARule55Note', hidden: (s) => !(s.ruleOf55A && s.sepp72tK401A && s.retireAgeA >= 55 && s.retireAgeA < 60) }], mcp: true },
    { key: 'ruleOf55B', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tK401BRule55Note', hidden: (s) => !(s.ruleOf55B && s.sepp72tK401B && s.retireAgeB >= 55 && s.retireAgeB < 60) }], mcp: true },
    { key: 'sepp72tIraA', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tIraAAgeField', hidden: (s) => !s.sepp72tIraA }], mcp: true },
    { key: 'sepp72tK401A', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tK401AAgeField', hidden: (s) => !s.sepp72tK401A }], mcp: true },
    { key: 'sepp72tIraB', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tIraBAgeField', hidden: (s) => !s.sepp72tIraB }], mcp: true },
    { key: 'sepp72tK401B', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'sepp72tK401BAgeField', hidden: (s) => !s.sepp72tK401B }], mcp: true },
    { key: 'tenure', type: 'choice', manual: true, values: ['own', 'rent', 'rentThenBuy'], fallback: 'own', mcp: true },
    { key: 'buyCash', type: 'bool', manual: true, mcp: true },
    { key: 'k401TypeA', type: 'choice', manual: true, values: ['traditional', 'roth'], fallback: 'traditional', mcp: true },
    { key: 'k401TypeB', type: 'choice', manual: true, values: ['traditional', 'roth'], fallback: 'traditional', mcp: true },
    // E1c: a partner's main income is W-2 pay or self-employment (business profit). Self-employed hides the match and the
    // per-paycheck premium (the engine ignores them: wageX is 0 for a self-employed partner).
    { key: 'incomeKindA', type: 'choice', manual: true, values: ['wages', 'self'], fallback: 'wages', mcp: true, reveals: [{ id: 'matchAField', hidden: (s) => s.incomeKindA === 'self' }, { id: 'healthPremiumAField', hidden: (s) => s.incomeKindA === 'self' }] },
    { key: 'incomeKindB', type: 'choice', manual: true, values: ['wages', 'self'], fallback: 'wages', mcp: true, reveals: [{ id: 'matchBField', hidden: (s) => s.singlePerson || s.incomeKindB === 'self' }, { id: 'healthPremiumBField', hidden: (s) => s.singlePerson || s.incomeKindB === 'self' }] },
    { key: 'iraTypeA', type: 'choice', manual: true, values: ['traditional', 'roth'], fallback: 'traditional', mcp: true },
    { key: 'iraTypeB', type: 'choice', manual: true, values: ['traditional', 'roth'], fallback: 'traditional', mcp: true },
    // PR 3 (backdoor Roth): each partner's box shows only while that partner's IRA contributions are traditional (B's also hides
    // in single-person mode, through its data-partner-b row).
    { key: 'iraBackdoorA', type: 'bool', sync: 'controls', resync: [], reveals: [{ id: 'iraBackdoorAField', hidden: (s) => s.iraTypeA !== 'traditional' }], mcp: true },
    { key: 'iraBackdoorB', type: 'bool', sync: 'controls', resync: [], reveals: [{ id: 'iraBackdoorBField', hidden: (s) => s.singlePerson || s.iraTypeB !== 'traditional' }], mcp: true },
    { key: 'pensionCoverage', type: 'choice', manual: true, values: ['none', 'a', 'b', 'both'], mcp: true },
    { key: 'filingStatus', type: 'choice', manual: true, values: ['mfj', 'single'], fallback: 'mfj', mcp: true },
    { key: 'ssBenefitBasisA', type: 'choice', sync: 'controls', resync: ['controls'], values: ['atClaim', 'pia'], fallback: 'atClaim', mcp: true },
    { key: 'ssBenefitBasisB', type: 'choice', sync: 'controls', resync: ['controls'], values: ['atClaim', 'pia'], fallback: 'atClaim', mcp: true },
    // SS PR 2: the survivor start age, null (at the survivor full retirement age) or 60-70. A select wired by hand
    // (ss-survivor-inputs.js): the shared choice listener would read the null option as Number('') = 0. Not offered over MCP
    // (its schema would be a string enum); normalizeState falls anything off the list back to null.
    { key: 'ssSurvivorStartAge', type: 'choice', manual: true, valueAs: 'number', values: [null, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70], fallback: null },
    { key: 'marryLater', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'marriageAgeField', hidden: (s) => !s.marryLater }], mcp: true },
    // Feedback B1: turning it off lowers a start age above 70 to 70 (`onChange` runs before the resyncs).
    { key: 'ssLateStartEnabled', type: 'bool', sync: 'controls', resync: ['controls'], onChange: () => clampSsStartAges(state), mcp: true },
    { key: 'ssCollectingA', type: 'bool', sync: 'controls', resync: [], mcp: true },
    { key: 'ssCollectingB', type: 'bool', sync: 'controls', resync: [], mcp: true },
    // SS PR 2: the widowed switch shows only in single-person mode, and its group only while it is on.
    { key: 'ssWidowed', type: 'bool', sync: 'controls', resync: ['controls'], reveals: [{ id: 'ssWidowedField', hidden: (s) => !s.singlePerson }, { id: 'ssWidowedFields', hidden: (s) => !s.singlePerson || !s.ssWidowed }], mcp: true },
    { key: 'ssSurvivorCollecting', type: 'bool', sync: 'controls', resync: [], mcp: true },
    { key: 'survivorEnabled', type: 'bool', sync: 'contrib', resync: ['contrib'], reveals: [{ id: 'survivorFields', hidden: (s) => !s.survivorEnabled }], mcp: true },
    { key: 'survivorPartner', type: 'choice', sync: 'contrib', resync: [], values: ['A', 'B'], fallback: 'A', mcp: true },
    // Not exposed through MCP.
    { key: 'acaEnhanced', type: 'bool', sync: 'contrib', resync: [] },
    { key: 'smoothWithdrawals', type: 'bool', sync: 'controls', resync: [] },
    { key: 'guardrailsEnabled', type: 'bool', sync: 'controls', resync: ['controls'] },
    { key: 'payFrequency', type: 'choice', sync: 'controls', resync: [], values: ['weekly', 'biweekly', 'semimonthly', 'monthly'], fallback: 'biweekly' },
    { key: 'stateTax', type: 'choice', sync: 'controls', resync: [] },
    { key: 'rothConvBracket', type: 'choice', sync: 'contrib', resync: [], valueAs: 'number', values: [10, 12, 22, 24, 32, 35], fallback: 22 },
    { key: 'rothConvStartSearch', type: 'choice', sync: 'contrib', resync: [], values: ['off', 'quick', 'thorough'], fallback: 'quick' },
  ];
