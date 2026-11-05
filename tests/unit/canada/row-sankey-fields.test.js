// The Sankey redesign's display-only row fields (Canada, task 1): the RRSP, TFSA and FHSA contributions, the employer's match and
// the payroll-deducted health premium, as scalars on every row of the planned run.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 8;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const FIELDS = ['contribRrsp', 'contribTfsa', 'contribFhsa', 'employerContrib', 'payrollPremiums'];

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
  // Same order as the engine's sum: traditionalContrib + rothContrib + fhsaContrib.
  c.expect(rows.filter((r) => r.contribRrsp + r.contribTfsa + r.contribFhsa !== r.contributions).map((r) => r.year), name + ': the split sums to contributions').toStrictEqual([]);
}

it('working: a couple saving into the RRSP, TFSA and FHSA with a match and a health premium', async () => {
  const rows = await rowsOf({
    ageA: 30, ageB: 30, retireAgeA: 55, retireAgeB: 55, tenure: 'rentThenBuy', buyAge: 36, rrspPctA: 100, rrspPctB: 100,
    tfsaPctA: 5, tfsaPctB: 5, fhsaPctA: 5, fhsaPctB: 5, matchA: 4, matchB: 4, healthPremiumA: 100, healthPremiumB: 100,
  });
  check('working', rows);
  c.expect(rows.some((r) => r.contribFhsa > 0), 'working: an FHSA contribution').toBe(true);
  c.expect(rows.some((r) => r.employerContrib > 0), 'working: an employer match').toBe(true);
  c.expect(rows.some((r) => r.payrollPremiums > 0), 'working: a payroll premium').toBe(true);
});

it('retired: no employer match and no payroll premium', async () => {
  const rows = await rowsOf({ singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, matchA: 4, healthPremiumA: 100 });
  check('retired', rows);
  c.expect(rows.every((r) => r.employerContrib === 0 && r.payrollPremiums === 0), 'retired: both 0').toBe(true);
});
