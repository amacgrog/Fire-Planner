import { currentProvince } from './province-rules.js';
import { state } from '../../shared/core/store.js';

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
  // RRIF minimum withdrawal factors (CRA prescribed factors). An RRSP must be
  // converted to a RRIF by the end of the year the holder turns 71; ages
  // 65-70 use the 1/(90-age) formula for a RRIF opened voluntarily before
  // then, though this planner only applies the minimum starting at 71 to
  // match its simplified single conversion-age assumption.
  export function rrifMinPct(age) {
    if (age < 71) return 0;
    const table = {
      71: 0.0528,
      72: 0.054,
      73: 0.0553,
      74: 0.0567,
      75: 0.0582,
      76: 0.0598,
      77: 0.0617,
      78: 0.0636,
      79: 0.0658,
      80: 0.0682,
      81: 0.0708,
      82: 0.0738,
      83: 0.0771,
      84: 0.0808,
      85: 0.0851,
      86: 0.0899,
      87: 0.0955,
      88: 0.1021,
      89: 0.1099,
      90: 0.1192,
      91: 0.1306,
      92: 0.1449,
      93: 0.1634,
      94: 0.1879,
    };
    return age >= 95 ? 0.2 : table[age] || 0.2;
  }
  // OAS recovery tax ("clawback"): 15% of net income (including OAS itself)
  // above the 2026 threshold, up to the full OAS amount received. Charged inside
  // personTaxCA (7N N1), on the return's full income. Modeled using the same
  // year's income rather than CRA's actual one-year lookback, as a planning-level
  // simplification (similar in spirit to the US planner's IRMAA lookback approximation).
  export const OAS_RECOVERY_THRESHOLD = 95323; // 2026 (CRA OAS recovery tax page, retrieved 2026-10-06)
