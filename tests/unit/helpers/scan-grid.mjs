// Test helper (ESM): the gap table's three households and the cliff-plan sweep's 768-household grid, one copy for the scripts and the Vitest suites.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The legacy-balance conversion the scripts use (tests/legacy_balances.js, CommonJS): re-exported, not copied.
export const { legacyToAccounts } = require('../../legacy_balances.js');

// the gap table (tests/solver_gap.js, deleted in Batch 5 step 5): three households, each converting at the plan's bracket setting (22%) from now to 74.
// `patch(lifeA, lifeB)` is the full state patch for one plan length (a single person takes lifeA only).
const GAP_BASE = [
  { name: 'early ACA single (TX)', p: { singlePerson: true, ageA: 55, retireAgeA: 55, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000 }, acct: { traditional: 1200000, roth: 100000 } },
  { name: 'couple 62, IRMAA (CA)', p: { singlePerson: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, stateTax: 'ca', spending: 110000, taxable: 800000 }, acct: { traditional: 2500000, roth: 200000 } },
  { name: 'couple 58, trad-heavy, ACA (NY)', p: { singlePerson: false, ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, acaEnabled: true, stateTax: 'ny', spending: 90000, taxable: 200000 }, acct: { traditional: 2000000, roth: 50000 } },
];
export const GAP_CASES = GAP_BASE.map((c) => ({
  name: c.name,
  patch: (lifeA, lifeB) => {
    const life = c.p.singlePerson ? { lifeExpectancyA: lifeA } : { lifeExpectancyA: lifeA, lifeExpectancyB: lifeB };
    return { ...c.p, ...life, rothConvEnabled: true, rothConvStartAge: c.p.ageA, rothConvEndAge: 74, ...legacyToAccounts(c.acct, c.p) };
  },
}));

const FIL = { mfj: 'couple, MFJ', 'single-couple': 'couple, two single returns', 'single-person': 'single person', hoh: 'single person, HoH (1 child b. 2016)' };
const kk = (n) => n / 1000 + 'k';
// The one-line description of a grid household (as tests/solver_scan.js prints it).
const describe = (g) => {
  const couple = g.filing === 'mfj' || g.filing === 'single-couple';
  const accts = couple ? `401(k) ${kk(g.trad / 2)} A + ${kk(g.trad / 2)} B` : `401(k) ${kk(g.trad)} A`;
  return `${FIL[g.filing]}; age ${g.age}; ${accts}; taxable ${kk(g.taxable)}; spending ${kk(g.spending)}; elections ${g.elections}; conversions ${g.conv ? 'on' : 'off'}`;
};

const patchOf = (g, mode) => ({
  ...(g.filing === 'mfj' ? { singlePerson: false, filingStatus: 'mfj' } : g.filing === 'single-couple' ? { singlePerson: false, filingStatus: 'single' } : { singlePerson: true }),
  children: g.filing === 'hoh' ? [{ birthYear: 2016, student: false }] : [],
  ageA: g.age, ageB: g.age, retireAgeA: g.age, retireAgeB: g.age, lifeExpectancyA: 95, lifeExpectancyB: 95,
  acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: g.taxable, spending: g.spending,
  smoothWithdrawals: mode === 'smooth', withdrawalMixEnabled: false,
  rothConvEnabled: g.conv, rothConvStartAge: g.age, rothConvEndAge: Math.max(g.age, 72), rothConvBracket: 22,
  ruleOf55A: g.elections === 'rule55', ruleOf55B: g.elections === 'rule55', sepp72tK401A: g.elections === 'sepp',
  cliffGuardEnabled: true,
  ...legacyToAccounts({ traditional: g.trad, roth: 200000 }, { singlePerson: g.filing === 'single-person' || g.filing === 'hoh' }),
});

// The 768-household grid in the interleaved order of tests/solver_scan.js (filing, age, traditional, taxable, spending,
// elections, conversions off then on). Each item: { name, patch, g } (g is the household's own fields).
// `conversions` (true / false) keeps one value of that axis; `mode` ('default' | 'smooth') sets the withdrawal patch.
export function scanHouseholds({ conversions, mode = 'default' } = {}) {
  const out = [];
  for (const filing of ['mfj', 'single-couple', 'single-person', 'hoh'])
    for (const age of [52, 58, 62, 66])
      for (const trad of [500000, 1500000])
        for (const taxable of [300000, 2000000])
          for (const spending of [60000, 130000])
            for (const elections of ['none', 'rule55', 'sepp'])
              for (const conv of [false, true]) {
                if (conversions !== undefined && conversions !== conv) continue;
                const g = { filing, age, trad, taxable, spending, elections, conv };
                out.push({ name: describe(g), patch: patchOf(g, mode), g });
              }
  return out;
}
