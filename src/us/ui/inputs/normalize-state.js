// Cleans a raw or saved state into a valid one (normalizeState)

import { normalizeLists } from '../../../shared/core/inputs/lists.js';
import { isValidStoredPlan, migrateStoredPlan } from '../../core/cliff-plan/plan-shape.js';
import { defaults } from '../../core/inputs/defaults.js';
import { normalizeUsLumps, normalizeUsStreams } from '../../core/inputs/list-rules.js';
import { FIELDS } from './fields.js';

  export function normalizeState(raw) {
    const s = { ...defaults, ...(raw || {}) };
    FIELDS.forEach((field) => {
      // A numeric field's finite numeric string (a hand-edited file, an old save: "24") is read as its number before the
      // values check, as the engine coerced it before the field had a fallback; anything else off the list falls back.
      if (field.fallback !== undefined && field.valueAs === 'number' && typeof s[field.key] === 'string' && s[field.key].trim() !== '' && Number.isFinite(Number(s[field.key])))
        s[field.key] = Number(s[field.key]);
      if (field.fallback !== undefined && !field.values.includes(s[field.key])) s[field.key] = field.fallback;
      if (field.trueUnlessFalse) s[field.key] = s[field.key] !== false;
    });
    s.retireAgeA = Math.max(s.ageA, Number(s.retireAgeA ?? s.retireAge ?? s.ageA));
    s.retireAgeB = Math.max(s.ageB, Number(s.retireAgeB ?? s.retireAge ?? s.ageB));
    s.lifeExpectancyA = Math.min(110, Math.max(s.lifeExpectancyA, s.ageA + 1));
    s.lifeExpectancyB = Math.min(110, Math.max(s.lifeExpectancyB, s.ageB + 1));
    s.fiWithdrawalRate = Math.min(15, Math.max(0.5, Number(s.fiWithdrawalRate) || defaults.fiWithdrawalRate));
    // Employer profit sharing, % of pay: 0 to 25 (the employer's deduction limit, and the usual ceiling for an owner).
    for (const k of ['profitSharingPctA', 'profitSharingPctB']) s[k] = Math.min(25, Math.max(0, Number(s[k]) || 0));
    normalizeLists(s, raw);
    normalizeUsStreams(s, raw);
    normalizeUsLumps(s, raw);
    s.dismissedEstimates = Array.isArray(raw?.dismissedEstimates) ? raw.dismissedEstimates : [];
    s.dismissedUnusualAssumptions = Array.isArray(raw?.dismissedUnusualAssumptions)
      ? raw.dismissedUnusualAssumptions
      : [];
    // appliedRothSchedule/appliedMixSchedule (see defaults above): plain
    // {age: value} objects written by the optimizer's "Apply this
    // schedule" button. Validated defensively — a hand-edited or stale
    // export could otherwise carry a bogus value straight into
    // simulate()'s withdrawal math. The allowed-value lists are duplicated
    // here rather than referencing ROTH_PER_YEAR_CANDIDATES/
    // WITHDRAWAL_MIX_CANDIDATES (declared later in the file) because
    // normalizeState() runs before those consts exist — keep both lists in
    // sync if the candidate menus ever change.
    {
      const sanitizeSchedule = (obj, allowedValues) => {
        if (!obj || typeof obj !== 'object') return null;
        const out = {};
        let any = false;
        for (const key of Object.keys(obj)) {
          const age = Number(key);
          if (!Number.isFinite(age) || age < 0 || age > 120) continue;
          const val = obj[key];
          if (!allowedValues.includes(val)) continue;
          out[age] = val;
          any = true;
        }
        return any ? out : null;
      };
      s.appliedRothSchedule = sanitizeSchedule(s.appliedRothSchedule, [0, 10, 12, 22, 24, 32, 35]);
      s.appliedMixSchedule = sanitizeSchedule(s.appliedMixSchedule, [
        0,
        'taxable',
        'traditional',
        'roth',
        'balanced',
        'smoothed',
        'taxTradHalf',
        'thirds',
      ]);
    }
    // storedPlan (Batch 5 step 4a): the saved cliff plan, kept as the very object when it passes the guard, else null. A v1
    // plan saved before `conv` (Batch 5 step 5b piece 3) is first migrated to a copy ending with `conv: null` (the raw input is
    // never written); a plan that already has `conv` keeps its identity.
    s.storedPlan = migrateStoredPlan(s.storedPlan);
    s.storedPlan = isValidStoredPlan(s.storedPlan) ? s.storedPlan : null;
    // Retirement accounts (see the defaults): balances and Roth IRA basis are non-negative
    // dollars, the Roth 401(k) basis is 0-100 percent. The pooled fields of older saves
    // (traditional, roth, traditionalSharePctA, rothBasisPct) are retired and not migrated
    // (owner decision, Batch 3A): they are deleted here because the spread above carries
    // unknown keys through, and an old save opens with empty retirement accounts.
    ['traditional', 'roth', 'traditionalSharePctA', 'rothBasisPct'].forEach((k) => delete s[k]);
    ['A', 'B'].forEach((p) => {
      ['tradIra', 'trad401k', 'rothIra', 'roth401k', 'rothIraBasis'].forEach((k) => {
        const v = Number(s[k + p]);
        s[k + p] = Number.isFinite(v) ? Math.max(0, v) : defaults[k + p];
      });
      const pctV = Number(s['roth401kBasisPct' + p]);
      s['roth401kBasisPct' + p] = Number.isFinite(pctV) ? Math.min(100, Math.max(0, pctV)) : defaults['roth401kBasisPct' + p];
    });
    // Rule of 55 was one household checkbox before it became a per-partner election: a ticked old box
    // ticks both partners (the engine already required each partner's own retirement age of 55 or more,
    // so the numbers do not move). Deleted because the spread above carries unknown keys through.
    if (raw && raw.ruleOf55Enabled === true && raw.ruleOf55A === undefined && raw.ruleOf55B === undefined) s.ruleOf55A = s.ruleOf55B = true;
    delete s.ruleOf55Enabled;
    // 72(t) SEPP is elected per account (sepp72tIra/K401 A/B, with a first-payment age; 0 means at the
    // owner's retirement age). The household-wide flags of older saves (sepp72tEnabled, and its A/B
    // split) are retired and not migrated (owner decision, Batch 3B): deleted here because the spread
    // above carries unknown keys through.
    ['sepp72tEnabled', 'sepp72tEnabledA', 'sepp72tEnabledB'].forEach((k) => delete s[k]);
    ['sepp72tIraAgeA', 'sepp72tK401AgeA', 'sepp72tIraAgeB', 'sepp72tK401AgeB'].forEach((k) => {
      const v = Number(s[k]);
      s[k] = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : defaults[k];
    });
    return s;
  }
