// The Sankey redesign's display-only row fields (US, task 1): the contribution split, the employer's contribution and the
// payroll-deducted premiums, as scalars on every row of the planned run.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 7;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const FIELDS = ['contribTraditional', 'contribRoth', 'employerContrib', 'payrollPremiums'];

async function rowsOf(patch) {
  const w = await world();
  await w.setState(patch);
  const e = await engine(w);
  return e.simulate().rows;
}
function check(name, rows) {
  const bad = [];
  for (const r of rows) for (const k of FIELDS) if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) bad.push(r.year + ':' + k);
  c.expect(bad.slice(0, 5), name + ': the new fields are finite numbers on every row').toStrictEqual([]);
  // Same order as the engine's sum: traditionalContrib + rothContrib.
  c.expect(rows.filter((r) => r.contribTraditional + r.contribRoth !== r.contributions).map((r) => r.year), name + ': the split sums to contributions').toStrictEqual([]);
}

it('working: a couple with a W-2 stream carrying a match and a health premium', async () => {
  const stream = { amount: 90000, startAge: 35, endAge: 45, followGrowth: false, growth: 0, owner: 'A', kind: 'wages', contribute: true, deferralType: 'traditional', deferralPct: 10, matchPct: 4, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 2400 };
  const rows = await rowsOf({ ageA: 35, ageB: 35, retireAgeA: 55, retireAgeB: 55, healthPremiumA: 3000, healthPremiumB: 3000, incomeSources: [stream] });
  check('working', rows);
  c.expect(rows.some((r) => r.employerContrib > 0), 'working: an employer contribution').toBe(true);
  c.expect(rows.some((r) => r.payrollPremiums > 0), 'working: a payroll premium').toBe(true);
});

it('retired: no employer contribution and no payroll premium', async () => {
  const rows = await rowsOf({ singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, incomeSources: [] });
  check('retired', rows);
  c.expect(rows.every((r) => r.employerContrib === 0 && r.payrollPremiums === 0), 'retired: both 0').toBe(true);
});
