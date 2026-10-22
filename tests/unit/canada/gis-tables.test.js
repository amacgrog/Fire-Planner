// Every row of ESDC GIS tables 1 to 5 (October to December 2026) against the fitted knots in BENEFIT_RULES.gis.
// Table rows are monthly amounts for an income band; the knots are annual, so compare annual values at the band
// midpoint. Tolerance: 12 dollars a year (1 dollar a month) for tables 1 to 3; 30 for tables 4 and 5, whose bands
// alternate widths and so carry up to 28 dollars a year of rounding stair.
//
// Converted from tests/gis_tables.js (Playwright, Planner_Canada.html). The old script executed 6,073 assert calls
// (6,068 table rows, the factor scaling check and four edge checks; the page-error assert excluded); this file asserts the
// same 6,073. NEW_COUNT tracks the ESDC table file (docs/sources/gis-tables-2026q4.json): it moves when a table row is
// added. Each it block sets up its own world.
import { it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 6073;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const tables = JSON.parse(readFileSync(new URL('../../../docs/sources/gis-tables-2026q4.json', import.meta.url), 'utf8'));

// The old assert(cond, message): one check per call, the expect runs only on a failure (same pass/fail result).
const check = (cond, msg) => {
  c.tick();
  if (!cond) expect.soft(cond, msg).toBe(true);
};

const SERIES = [
  ['table1.gistotal', 'single', 12],
  ['table2.gistotal', 'spouseOas', 12],
  ['table3.gistotal', 'spouseNoOas', 12],
  ['table4.gistotal', 'couplePensioner', 30],
  ['table4.alwtotal', 'coupleAllowance', 30],
  ['table5.alwstotal', 'survivorAllowance', 30],
];

async function gis() {
  const w = await world();
  const { gisAnnual } = await w.load('canada/core/benefits/benefits.js');
  return gisAnnual;
}

for (const [key, situation, tol] of SERIES) {
  it(`${key} (${situation}): every row within ${tol} a year`, async () => {
    const gisAnnual = await gis();
    const rows = tables[key];
    const mids = rows.map((r) => (r[0] + r[1]) / 2);
    const got = mids.map((m) => gisAnnual(situation, m));
    rows.forEach((r, i) => {
      const want = r[2] * 12,
        d = Math.abs(got[i] - want);
      check(d <= tol, `${key} income ${mids[i]}: table ${want.toFixed(2)} a year, formula ${got[i].toFixed(2)} (off by ${d.toFixed(2)}, tolerance ${tol})`);
    });
  });
}

it('scaling: amounts and income cutoffs move together with the factor', async () => {
  const gisAnnual = await gis();
  const [a, b] = [gisAnnual('single', 10000), gisAnnual('single', 11000, 1.1)];
  check(Math.abs(b - a * 1.1) < 1e-9, 'factor scaling: gisAnnual(income * f, f) must equal f * gisAnnual(income)');
});

it('past the cutoff and at zero', async () => {
  const gisAnnual = await gis();
  const edge = [gisAnnual('single', 23112), gisAnnual('single', 1e9), gisAnnual('single', 0), gisAnnual('couplePensioner', 42767), gisAnnual('couplePensioner', 42768)];
  c.tick();
  expect.soft(edge[0], 'zero at the single cutoff').toBe(0);
  c.tick();
  expect.soft(edge[1], 'zero far above the cutoff').toBe(0);
  check(Math.abs(edge[2] - 13666.8) < 1e-9, 'maximum at zero income (1,138.90 a month, 12 times)');
  check(edge[3] > 3000 && edge[4] === 0, 'table 4 ends at 42,768, where the younger spouse Allowance ends (benefitsFor continues on table 3: tests/unit/canada/benefits.test.js)');
});
