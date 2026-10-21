import { state } from '../../../shared/core/store.js';

  // "Still estimated" badges + dashboard rollup + guided review nav. A field
  // is "counted" when it's personal (not a pure modeling assumption like
  // returnRate/inflation, which keep only the quiet `.is-default` dot
  // above), its gating feature (if any) is currently on, it's still at its
  // default value, and the person hasn't explicitly dismissed it. See the
  // "estimated field badges" note in CLAUDE.md for the full design.
  export const ESTIMATE_ALWAYS_IDS = [
    'ageA', 'ageB', 'retireAgeA', 'retireAgeB', 'incomeA', 'incomeB', 'matchA', 'matchB',
    'rrspPctA', 'rrspPctB', 'tfsaPctA', 'tfsaPctB', 'spending', 'taxable', 'basisRatio',
    'traditional', 'roth', 'cash', 'cashReserve', 'homeValue', 'mortgagePrincipal', 'mortgage',
    'mortgageRate', 'mortgageYears', 'extraPrincipal', 'maintenance', 'propertyTax',
    'homeInsurance', 'rent', 'cppMonthlyA', 'cppStartAgeA', 'cppMonthlyB', 'cppStartAgeB',
    'oasMonthlyA', 'oasStartAgeA', 'oasMonthlyB', 'oasStartAgeB', 'pensionYearlyA',
    'pensionStartAgeA', 'pensionYearlyB', 'pensionStartAgeB', 'healthPremiumA', 'healthPremiumB',
    'healthcare', 'fhsa', 'fhsaPctA', 'fhsaPctB',
  ];
  export const ESTIMATE_GATED_GROUPS = [
    { ids: ['survivorDeathAge', 'survivorSpendingPct'], gate: () => !!state.survivorEnabled },
    { ids: ['meltdownStartAge', 'meltdownEndAge'], gate: () => !!state.meltdownEnabled },
    { ids: ['ltcYearlyA', 'ltcAgeA', 'ltcYearlyB', 'ltcAgeB'], gate: () => !!state.ltcEnabled },
    {
      ids: ['buyAge', 'buyDownPct', 'buyClosingPct', 'buyTerm', 'buyExtraPrincipal'],
      gate: () => state.tenure === 'rentThenBuy',
    },
  ];
  export const mcpSchemaFor = (field) =>
    field.type === 'number'
      ? { type: 'number' }
      : field.type === 'bool'
        ? { type: 'boolean' }
        : { type: 'string', enum: field.values };
  export const mcpAccepts = (field, v) =>
    field.type === 'number'
      ? Number.isFinite(v)
      : field.type === 'bool'
        ? typeof v === 'boolean'
        : field.values.includes(v);
