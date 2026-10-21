import { taxIndexFactor } from '../../../shared/core/tax-index-factor.js';
import { filingKey } from '../federal-deductions.js';
import { IRMAA_TIERS } from '../irmaa-tiers.js';
import { taxableSocialSecurity } from '../tax/social-security-tax.js';
import { magiForIrmaaLine } from '../magi-for-irmaa-line.js';

  // E3: the status cell also names an IRMAA appeal (form SSA-44) where one lowered a partner's charge (appended to the title;
  // US only, renderTable is shared).
  export const APPEAL_EVENT = ['', 'end of a job', 'retirement', "spouse's death"];
  export function irmaaTiers(filing, yearIndex) {
    const factor = taxIndexFactor(yearIndex);
    // [upper bound, monthly surcharge per enrolled partner, bound inclusive?].
    // CMS: the lower tiers read "greater than X, up to and including Y", but the
    // top tier starts AT $500,000 / $750,000 ("$500,000 or above"), so the
    // second-highest tier's bound is exclusive.
    return IRMAA_TIERS[filingKey(filing, 'irmaa')].map(([cap, amt, inclusive]) => [cap === Infinity ? Infinity : cap * factor, amt, inclusive]);
  }
  export function irmaaSurcharge(magi2yr, filing, yearIndex) {
    const tiers = irmaaTiers(filing, yearIndex);
    for (const [cap, amt, inclusive] of tiers)
      if (inclusive ? magi2yr <= cap : magi2yr < cap) return amt * 12;
    return tiers[tiers.length - 1][1] * 12;
  }
  // The highest MAGI that stays within magi0's current IRMAA tier (Infinity
  // if magi0 is already in the top tier, since there's no higher tier left
  // to protect against). An exclusive bound ("under $500,000") is one cent
  // below the bound itself.
  export function irmaaTierCeiling(magi0, filing, yearIndex) {
    const tiers = irmaaTiers(filing, yearIndex);
    for (const [cap, , inclusive] of tiers)
      if (inclusive ? magi0 <= cap : magi0 < cap) return cap === Infinity ? Infinity : inclusive ? cap : cap - 0.01;
    return Infinity;
  }
  // IRMAA is assessed on Medicare's MAGI: AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), which counts only the
  // TAXABLE part of Social Security. The engine's MAGI is the ACA's (26 U.S.C. 36B(d)(2)(B): all of Social Security), so
  // IRMAA amounts convert with irmaaMagiOf and IRMAA lines and caps are translated into the engine's MAGI with its exact
  // inverse. `ss` and `filing` are the return's own benefit and filing status in the year the MAGI is earned (irmaaSsOf,
  // returnStatusA). magi - ss is all other income, the otherIncome taxFor passes to taxableSocialSecurity. Tax-exempt
  // interest is not modeled (no input).
  export function irmaaMagiOf(magi, ss, filing) {
    return ss > 0 ? magi - ss + taxableSocialSecurity(ss, magi - ss, filing) : magi;
  }
  // The highest engine MAGI that keeps a single-tier return's IRMAA MAGI inside the tier engine MAGI m puts it in.
  export function irmaaRoomFor(m, ss, st, year) {
    return magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(m, ss, st), 'single', year), ss, st);
  }
