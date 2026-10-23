// The enhanced ACA applicable percentages (the "Assume enhanced ACA subsidies return" option): the 2021-2025 table of
// IRC 36B(b)(3)(A)(iii), 0% to 150% of the poverty line, then linear within each band (150-200% 0->2%, 200-250% 2->4%,
// 250-300% 4->6%, 300-400% 6->8.5%), 8.5% from 400% with no cliff. Expected values are hand-computed from the statute.
// The net-cost cases run a couple with no children in Texas (no Medicaid expansion) at year 0 with no inflation, so the
// poverty line for two is the 2026 figure, 15,650 + 5,500 = 21,150, and the gross premium 20,000 does not bind.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const FPL2 = 21150;

it('acaExpectedPct, enhanced: the banded statutory table', async () => {
  const w = await world();
  const { acaExpectedPct } = await w.load('us/core/healthcare/aca.js');
  expect(acaExpectedPct(1, true)).toBe(0);
  expect(acaExpectedPct(1.5, true)).toBe(0);
  expect(acaExpectedPct(1.75, true)).toBe(1);
  expect(acaExpectedPct(2, true)).toBe(2);
  expect(acaExpectedPct(2.25, true)).toBe(3);
  expect(acaExpectedPct(2.5, true)).toBe(4);
  expect(acaExpectedPct(3, true)).toBe(6);
  expect(acaExpectedPct(3.05, true)).toBe(6.125);
  expect(acaExpectedPct(3.5, true)).toBe(7.25);
  expect(acaExpectedPct(4, true)).toBe(8.5);
  expect(acaExpectedPct(5, true)).toBe(8.5);
});

it('acaExpectedPct, regular: unchanged (Rev. Proc. 2025-25), 9.96% from 300% on', async () => {
  const w = await world();
  const { acaExpectedPct } = await w.load('us/core/healthcare/aca.js');
  expect(acaExpectedPct(1.2, false)).toBe(2.1);
  expect(acaExpectedPct(2, false)).toBe(6.6);
  expect(acaExpectedPct(3.5, false)).toBe(9.96);
  expect(acaExpectedPct(5, false)).toBe(9.96);
});

it('acaNetCost, enhanced: 200%, 300% and 305% of the poverty line, and no cliff above 400%', async () => {
  const w = await world();
  const { acaNetCost } = await w.load('us/core/healthcare/aca.js');
  await w.setState({ stateTax: 'tx', inflation: 0, children: [], acaEnabled: true, acaEnhanced: true });
  const ctx = await w.ctx();
  expect(42300 / FPL2).toBe(2);
  expect(acaNetCost(ctx, 42300, 2, 20000, 0)).toBe(846); // 2% of 42,300
  expect(acaNetCost(ctx, 63450, 2, 20000, 0)).toBe(3807); // 6% of 63,450
  expect(acaNetCost(ctx, 64507.5, 2, 20000, 0)).toBe(3951.084375); // 6.125% of 64,507.50 (305%)
  expect(acaNetCost(ctx, 105750, 2, 20000, 0)).toBe(8988.75); // 8.5% of 105,750 (500%)
});

it('acaNetCost, regular: the full premium above 400%', async () => {
  const w = await world();
  const { acaNetCost } = await w.load('us/core/healthcare/aca.js');
  await w.setState({ stateTax: 'tx', inflation: 0, children: [], acaEnabled: true, acaEnhanced: false });
  const ctx = await w.ctx();
  expect(acaNetCost(ctx, 105750, 2, 20000, 0)).toBe(20000);
});
