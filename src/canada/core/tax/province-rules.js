import { currentProvince } from '../province-rules.js';
import { state } from '../../../shared/core/store.js';

  export function provinceTaxTreatmentNote() {
    const name = currentProvince().rule.name;
    const capGainsText =
      "Capital gains use the standard 50% inclusion rate and are taxed at each person's marginal federal + provincial rate, alongside CPP, OAS, RRIF/RRSP withdrawals, and pension income.";
    let special = '';
    if (state.province === 'on')
      special =
        ' plus the two-tier Ontario surtax (20%/36% on Ontario tax payable above its thresholds) and the income-tested Ontario Health Premium (up to $900/year)';
    else if (state.province === 'qc')
      special =
        " Quebec residents also receive a 16.5% federal tax abatement (applied to the federal tax total below), since Quebec collects its own provincial tax independently — this is netted against Quebec's noticeably higher provincial brackets, not an extra credit on top of them.";
    else if (state.province === 'bc')
      special =
        ' BC eliminated its Medical Services Plan premium in 2020, so no separate provincial health premium is modeled.';
    else if (state.province === 'pe')
      special =
        ' PEI eliminated its provincial surtax for 2024 and later years, so none is modeled.';
    return `<b>${name} provincial tax.</b> The model applies ${name}'s 2026 provincial brackets and basic personal amount on top of federal tax${state.province === 'on' ? special : ''}. ${capGainsText}${state.province !== 'on' ? special : ''} The basic personal amount, the spouse amount (claimed by the higher-income partner) and the eligible-dependant amount (a single parent or survivor with a child under 18) are credits at the province's lowest rate, not deductions.`;
  }
