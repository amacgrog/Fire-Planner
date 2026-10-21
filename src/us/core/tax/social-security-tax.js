// Taxable Social Security and the IRMAA benefit and return-status helpers (US)

import { filingKey, SS_BASE } from './federal-rules.js';

  // The filing status of Partner A's own return in a two-return year (A claims the children), as taxFor's two-filer branch.
  export function returnStatusA(dependents) {
    if (dependents) for (let i = 0; i < dependents.length; i++) if (dependents[i].qualifyingChild) return 'hoh';
    return 'single';
  }
  // The benefit on a household or one-person return (the survivor remap puts the survivor's benefit in slot A).
  export function irmaaSsOf(profile) {
    return profile.singlePerson ? profile.ssA || 0 : (profile.ssA || 0) + (profile.ssB || 0);
  }
  // taxableSocialSecurity on an SS_BASE row already read: the same arithmetic, for magiForIrmaaLine's four kinks.
  export function taxableSsOnRow(benefits, otherIncome, lower, upper, base) {
    const provisional = otherIncome + benefits * 0.5;
    if (provisional <= lower) return 0;
    if (provisional <= upper) return Math.min(benefits * 0.5, (provisional - lower) * 0.5);
    return Math.min(benefits * 0.85, (provisional - upper) * 0.85 + Math.min(base, benefits * 0.5));
  }
  export function taxableSocialSecurity(benefits, otherIncome, filing = 'mfj') {
    const [lower, upper, base] = SS_BASE[filingKey(filing, 'ss')];
    return taxableSsOnRow(benefits, otherIncome, lower, upper, base);
  }
