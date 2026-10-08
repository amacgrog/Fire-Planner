// Legacy / invalid saved-state corpus (Phase 2, step 3). normalizeState() must turn any old, partial
// or hand-edited autosave into the same complete state it always has: enum fallbacks, "true unless
// explicitly false" flags, retirement/life-expectancy clamps, legacy-field migrations, unknown-key
// handling. Each case is injected as the browser's autosave before the planner loads; the resulting
// state (keys sorted) is hashed and compared to tests/snapshots/legacy_state.json, which was
// generated from the code BEFORE the field registry replaced the hand-written guards.
//   node tests/legacy_state.js            check
//   node tests/legacy_state.js --update   rewrite the baseline (only for an intended behavior change)
//   LEGACY_ROOT=<dir> node tests/legacy_state.js ...   load the planners from another checkout

const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.LEGACY_ROOT || path.resolve(__dirname, '..'));
const BASELINE = path.join(__dirname, 'snapshots', 'legacy_state.json');

const COMMON = {
  empty: {},
  'invalid enums': { tenure: 'x', payFrequency: 'daily', survivorPartner: 'C' },
  'valid non-default enums': { tenure: 'rentThenBuy', payFrequency: 'weekly', survivorPartner: 'B' },
  'age clamps': { ageA: 60, ageB: 58, retireAgeA: 50, retireAgeB: 40, lifeExpectancyA: 55, lifeExpectancyB: 200 },
  'old retireAge field': { ageA: 40, ageB: 38, retireAge: 55 },
  'unknown and retired keys': { notAField: 1, otherLoansEnabled: false, otherIncomeEnabled: false, bridgeEnabled: false },
  'legacy bridge plan': { bridgeEnabled: true, bridgeIncomeA: 40000, bridgeStartAgeA: 50, bridgeEndAgeA: 60, ageA: 45, ageB: 43, retireAgeA: 50, retireAgeB: 48 },
  'legacy loans and income': {
    otherLoansEnabled: true, loans: [{ principal: 10000, balance: 8000, rate: 5, term: 5, extra: 0 }, { principal: 0, balance: 0, rate: 0, term: 0, extra: 0 }],
    otherIncomeEnabled: true, incomeSources: [{ enabled: true, amount: 5000, startAge: 60, endAge: 70 }, { enabled: false, amount: 9, startAge: 1, endAge: 2 }],
  },
  'string numbers and junk': { spending: '70000', taxable: 'abc', fiWithdrawalRate: 99 },
  'garbage schedules': { appliedMixSchedule: { 60: 'nonsense', 61: 'taxable' }, appliedRothSchedule: { 60: 7, 61: 22 } },
  'dismissed arrays wrong type': { dismissedEstimates: 'x', dismissedUnusualAssumptions: 5 },
  // Batch 7A: the children list (exact values are asserted in tests/child_dependents.js).
  'children valid': { children: [{ birthYear: 2015, student: false }, { birthYear: 2030, student: true }] },
  'children junk': { children: [{ birthYear: 'x' }, { birthYear: 1900, student: 'yes' }, { birthYear: 2500 }, { student: true }, null, 7, { birthYear: '2012.6', student: true }, { birthYear: null }, { birthYear: '' }] },
  'children wrong type': { children: 'two' },
  'children over the cap': { children: Array.from({ length: 14 }, (_, i) => ({ birthYear: 2000 + i })) },
};
const US = {
  ...COMMON,
  'us invalid enums': { filingStatus: 'y', stateTax: 'zz', k401Type: 'bogus', iraType: 'bogus', pensionCoverage: 'weird' },
  'employer flags': { employerCoversSpouseA: false, employerCoversSpouseB: 0 },
  // Batch 7O O1: a default-true flag (missing or junk reads as on, only a literal false turns it off).
  'medicaid flag false': { medicaidWhenEligible: false },
  'medicaid flag junk': { medicaidWhenEligible: 0 },
  'employer flags absent': { acaEnabled: true },
  'legacy sepp72t both': { sepp72tEnabled: true },
  'sepp72t already split': { sepp72tEnabled: true, sepp72tEnabledA: true, sepp72tEnabledB: false },
  // Batch 3B: 72(t) is elected per account; the household-wide flags above are retired and dropped (no migration).
  'sepp72t per account valid': { sepp72tK401A: true, sepp72tK401AgeA: 55, sepp72tIraB: true, sepp72tIraAgeB: 52 },
  'sepp72t per account junk': { sepp72tIraA: 'yes', sepp72tIraAgeA: -4, sepp72tK401AgeB: 500, sepp72tK401AgeA: 'x' },
  // 3C PR 1: Rule of 55 is elected per partner; an old household box ticks both, and the old key is dropped.
  'legacy household rule of 55': { ruleOf55Enabled: true },
  'legacy rule of 55 off': { ruleOf55Enabled: false },
  // 3C: the cliff guard defaults on (an old save without the key reads as on); only a literal false turns it off.
  'cliff guard explicitly off': { cliffGuardEnabled: false },
  // Batch 3A: the pooled retirement fields are retired and NOT migrated (owner decision); an old
  // save opens with empty/default accounts and the retired keys are dropped.
  'retired pooled retirement fields': { traditional: 500000, roth: 100000, traditionalSharePctA: 70, rothBasisPct: 40 },
  'account balances valid': { trad401kA: 250000, tradIraB: 80000, roth401kA: 20000, rothIraB: 30000, rothIraBasisB: 12000, roth401kBasisPctA: 60 },
  'account balances junk': { trad401kA: -5, tradIraA: 'x', rothIraB: null, rothIraBasisA: -1, roth401kBasisPctA: 250, roth401kBasisPctB: -3 },
  // E1a: employer profit sharing, clamped 0 to 25 (exact values asserted in tests/contribution_limits.js).
  'profit sharing junk': { profitSharingPctA: 'x', profitSharingPctB: 400 },
  'profit sharing negative': { profitSharingPctA: -5 },
  'income above the old slider cap': { incomeA: 500000 },
};
const CA = {
  ...COMMON,
  'ca invalid province': { province: 'xx' },
  'ca valid province': { province: 'qc' },
};
const PLANNERS = [
  { key: 'US', file: 'Planner_US.html', storage: 'fireCouplePlanner.massachusettsOffline.v1', cases: US },
  { key: 'Canada', file: 'Planner_Canada.html', storage: 'fireCouplePlanner.canadaOffline.v1', cases: CA },
];
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

(async () => {
  const update = process.argv.includes('--update');
  const browser = await chromium.launch();
  const got = {};
  try {
    for (const p of PLANNERS) {
      got[p.key] = {};
      for (const [name, raw] of Object.entries(p.cases)) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [p.storage, JSON.stringify({ state: raw, mode: 'real' })]);
        await page.goto('file://' + path.join(ROOT, p.file));
        await page.waitForTimeout(150);
        const state = await page.evaluate(() => JSON.stringify(window.__test_getState()));
        if (errors.length) throw new Error(`${p.key} "${name}": page errors ${errors}`);
        got[p.key][name] = sha(JSON.stringify(canon(JSON.parse(state))));
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (update) {
    fs.writeFileSync(BASELINE, JSON.stringify(got, null, 1) + '\n');
    console.log('wrote legacy-state baseline:', Object.entries(got).map(([k, v]) => `${k} ${Object.keys(v).length}`).join(', '));
    return;
  }
  const want = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const bad = [];
  for (const k of Object.keys(got)) for (const n of new Set([...Object.keys(got[k]), ...Object.keys(want[k] || {})])) if (got[k][n] !== (want[k] || {})[n]) bad.push(`${k} "${n}": normalizeState result changed`);
  if (bad.length) {
    console.error('legacy-state corpus MISMATCH:\n  ' + bad.join('\n  '));
    process.exit(1);
  }
  console.log(`legacy-state corpus passed (${Object.entries(got).map(([k, v]) => `${k} ${Object.keys(v).length}`).join(', ')} saves normalize unchanged)`);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
