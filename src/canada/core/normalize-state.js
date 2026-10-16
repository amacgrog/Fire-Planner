import { defaults } from './defaults.js';
import { FIELDS } from './fields.js';
import { normalizeLists } from '../../shared/core/list-normalization.js';

  export function normalizeState(raw) {
    const s = { ...defaults, ...(raw || {}) };
    FIELDS.forEach((field) => {
      if (field.fallback !== undefined && !field.values.includes(s[field.key])) s[field.key] = field.fallback;
      if (field.trueUnlessFalse) s[field.key] = s[field.key] !== false;
    });
    s.retireAgeA = Math.max(s.ageA, Number(s.retireAgeA ?? s.retireAge ?? s.ageA));
    s.retireAgeB = Math.max(s.ageB, Number(s.retireAgeB ?? s.retireAge ?? s.ageB));
    s.lifeExpectancyA = Math.min(110, Math.max(s.lifeExpectancyA, s.ageA + 1));
    s.lifeExpectancyB = Math.min(110, Math.max(s.lifeExpectancyB, s.ageB + 1));
    s.fiWithdrawalRate = Math.min(15, Math.max(0.5, Number(s.fiWithdrawalRate) || defaults.fiWithdrawalRate));
    normalizeLists(s, raw);
    s.dismissedEstimates = Array.isArray(raw?.dismissedEstimates) ? raw.dismissedEstimates : [];
    s.dismissedUnusualAssumptions = Array.isArray(raw?.dismissedUnusualAssumptions)
      ? raw.dismissedUnusualAssumptions
      : [];
    return s;
  }
