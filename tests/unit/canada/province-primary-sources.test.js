// Province rule figures corrected against the province's or the CRA's own pages (validation track V1, 2026-11-16).
//
// Each case runs one real PROVINCE_RULES row at projection year 0 (inflation 0, so the 2026 figures apply as published)
// and compares the planner with a figure worked by hand from the source cited beside it. The expected values are
// hand-computed literals, never engine output; the tolerance is half a cent, written out.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const near = (a, b, label) => {
  expect(Math.abs(a - b) <= 0.005, label + ': expected ' + b + ', got ' + a).toBe(true);
};

it('Saskatchewan: the 2026 medical expense ceiling is $2,735', async () => {
  // Government of Saskatchewan, 2026 Personal Income Tax Structure (read 2026-11-16): medical expense tax credit, 3 per
  // cent of net income, ceiling $2,735 (2025 SK428 line 44: $2,681; T4127 Table 8.2: 2026 index rate 2.0%). The credit
  // is worth the lowest rate, 10.5%.
  // Net income 150,000 (3% is 4,500, so the ceiling binds), expenses 10,000: (10,000 - 2,735) x 10.5% = 7,265 x 10.5%
  // = 762.825 less Saskatchewan tax.
  const w = await world();
  const tx = await w.load('canada/core/tax/tax.js');
  await w.setState({ province: 'sk', inflation: 0 });
  const ctx = await w.ctx();
  const prov = (medical) => tx.provincialTaxCA(ctx, 150000, 0, 0, 0, 0, null, 0, -1, 0, 0, 0, medical);
  near(prov(0) - prov(10000), 762.825, 'SK medical credit at 150,000');
});
