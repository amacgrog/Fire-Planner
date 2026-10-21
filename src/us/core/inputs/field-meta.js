import { state } from '../../../shared/core/store.js';

  // "Still estimated" badges + dashboard rollup + guided review nav. A field
  // is "counted" when it's personal (not a pure modeling assumption like
  // returnRate/inflation, which keep only the quiet `.is-default` dot
  // above), its gating feature (if any) is currently on, it's still at its
  // default value, and the person hasn't explicitly dismissed it. See the
  // "estimated field badges" note in CLAUDE.md for the full design.
  export const ESTIMATE_ALWAYS_IDS = [
    'ageA', 'ageB', 'retireAgeA', 'retireAgeB', 'incomeA', 'incomeB', 'matchA', 'matchB', 'profitSharingPctA', 'profitSharingPctB',
    'k401PctA', 'k401PctB', 'iraPctA', 'iraPctB', 'spending', 'taxable', 'basisRatio',
    'trad401kA', 'trad401kB', 'tradIraA', 'tradIraB', 'roth401kA', 'roth401kB', 'rothIraA', 'rothIraB',
    'cash', 'cashReserve', 'homeValue', 'mortgagePrincipal', 'mortgage',
    'mortgageRate', 'mortgageYears', 'extraPrincipal', 'maintenance', 'propertyTax',
    'homeInsurance', 'rent', 'ssMonthlyA', 'ssStartAgeA', 'ssMonthlyB', 'ssStartAgeB',
    'pensionYearlyA', 'pensionStartAgeA', 'pensionYearlyB', 'pensionStartAgeB', 'healthPremiumA',
    'healthPremiumB', 'healthcare', 'medicareYearly',
  ];
  export const ESTIMATE_GATED_GROUPS = [
    { ids: ['megaPctA', 'megaPctB'], gate: () => !!state.megaBackdoor },
    { ids: ['survivorDeathAge', 'survivorSpendingPct'], gate: () => !!state.survivorEnabled },
    { ids: ['rothConvStartAge', 'rothConvEndAge'], gate: () => !!state.rothConvEnabled },
    { ids: ['ltcYearlyA', 'ltcAgeA', 'ltcYearlyB', 'ltcAgeB'], gate: () => !!state.ltcEnabled },
    {
      ids: ['buyAge', 'buyDownPct', 'buyClosingPct', 'buyTerm', 'buyExtraPrincipal'],
      gate: () => state.tenure === 'rentThenBuy',
    },
    // marriageAgeA only matters (and is only shown — see #marriageAgeField)
    // while the "start single, then file MFJ" transition is enabled.
    { ids: ['marriageAgeA'], gate: () => !!state.marryLater },
  ];
  export const mcpSchemaFor = (field) =>
    field.type === 'number'
      ? { type: 'number' }
      : field.type === 'bool'
        ? { type: 'boolean' }
        : { type: 'string', enum: field.values };
  export const mcpAccepts = (field, v) =>
    field.type === 'number'
      ? Number.isFinite(v) && (field.min === undefined || v >= field.min) && (field.max === undefined || v <= field.max)
      : field.type === 'bool'
        ? typeof v === 'boolean'
        : field.values.includes(v);
