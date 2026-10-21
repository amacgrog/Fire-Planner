// US list rules: stream and lump normalization, life-expectancy clamps, reveal map

import { state } from '../../../shared/core/store.js';

  // E1b: income stream owner, kind and retirement-contribution panel (US; Canada carries none of these keys until E1-CA).
  // normalizeLists (shared) keeps only the common stream keys, so these are read from the raw save, aligned the way
  // normalizeLists filtered it. Unknown values fall back to the legacy meaning: Partner A, not earned, no contribution.
  export function normalizeUsStreams(s, raw) {
    const legacy = !!raw && 'otherIncomeEnabled' in raw,
      src = !legacy && Array.isArray(raw?.incomeSources) ? raw.incomeSources.filter((x) => x && typeof x === 'object') : [],
      pct0 = (v) => (v !== '' && v !== null && Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : 0);
    s.incomeSources = s.incomeSources.map((x, i) => {
      const r = src[i] || {};
      return {
        ...x,
        owner: r.owner === 'B' ? 'B' : 'A',
        kind: r.kind === 'wages' || r.kind === 'self' ? r.kind : 'other',
        contribute: r.contribute === true,
        deferralType: r.deferralType === 'roth' ? 'roth' : 'traditional',
        deferralPct: pct0(r.deferralPct),
        matchPct: pct0(r.matchPct),
        afterTaxPct: pct0(r.afterTaxPct),
        personalPct: pct0(r.personalPct),
        profitSharingPct: Math.min(25, pct0(r.profitSharingPct)),
        healthPremium: r.healthPremium !== '' && r.healthPremium !== null && Number.isFinite(Number(r.healthPremium)) ? Math.max(0, Number(r.healthPremium)) : 0,
      };
    });
  }
  // E1d: one-time income tax treatment and owner (US). normalizeLists (shared) keeps only amount, age and flat, so these
  // are read from the raw save, aligned exactly as normalizeUsStreams aligns streams (a legacy save ignores the raw keys).
  // Unknown values fall back to the legacy meaning: tax-free, Partner A.
  export function normalizeUsLumps(s, raw) {
    const legacy = !!raw && 'otherIncomeEnabled' in raw,
      src = !legacy && Array.isArray(raw?.oneTimeIncome) ? raw.oneTimeIncome.filter((x) => x && typeof x === 'object') : [];
    s.oneTimeIncome = s.oneTimeIncome.map((x, i) => {
      const r = src[i] || {};
      const g = r.gainPct !== '' && r.gainPct !== null && Number.isFinite(Number(r.gainPct)) ? Math.min(100, Math.max(0, Number(r.gainPct))) : 100;
      return {
        ...x,
        kind: r.kind === 'wages' || r.kind === 'ordinary' || r.kind === 'gain' || r.kind === 'inheritedTrad' || r.kind === 'inheritedRoth' ? r.kind : 'free',
        owner: r.owner === 'B' ? 'B' : 'A',
        gainPct: g,
        activeBusiness: r.activeBusiness === true,
      };
    });
  }
  export const clampLifeExpectancyA = () =>
    (state.lifeExpectancyA = Math.min(110, Math.max(state.lifeExpectancyA, state.ageA + 1)));
  export const clampLifeExpectancyB = () =>
    (state.lifeExpectancyB = Math.min(110, Math.max(state.lifeExpectancyB, state.ageB + 1)));
  // load-time: creates an empty Map; reads nothing
  // Registry reveals by element id, so code that shows or hides a whole group of elements (the partner-B
  // loop in syncControls) does not undo a reveal that hides one of them.
  export const REVEAL_BY_ID = new Map();
  export function revealHidden(id) {
    const fn = REVEAL_BY_ID.get(id);
    return !!fn && fn(state);
  }
