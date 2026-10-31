// The ACA 400% line caps a Roth conversion only while the year's MAGI is still under it (conversionMagiCeiling). Once the
// pre-conversion MAGI is over the line the premium credit is already lost (no enhanced credit), so a conversion costs no
// subsidy and the line must not hold it at zero; the IRMAA ceiling next to it already works this way (it keeps the year in
// the tier it already sits in). Lines at year 0 (tax index factor 1): one person 15,650 x 4 = 62,600, two 21,150 x 4 = 84,600.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

async function setup() {
  const w = await world();
  await w.setState({ acaEnabled: true, acaEnhanced: false, singlePerson: false, children: [] });
  w.setTaxYear(2026);
  const { conversionMagiCeiling } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  // Both retired, both under 63 (no IRMAA ceiling), both on the marketplace.
  const args = (patch) => ({
    acaEligibleA: true, acaEligibleB: true, singlePerson: false, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
    workingA: false, workingB: false, age: 60, ageB: 58, filing: 'mfj', year: 0, profile: { ssA: 0, ssB: 0 }, ...patch,
  });
  return { ceiling: (patch) => conversionMagiCeiling(ctx, args(patch)) };
}

it('household return: under the line, the line caps the conversion', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 50000 })).toBe(84600);
});

it('household return: already over the line, the line does not cap it', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 155000 })).toBe(Infinity);
});

it('household return: exactly at the line, the line still caps it (no room left)', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 84600 })).toBe(84600);
});

it('two returns: a return over its own line no longer caps the conversion; one under it still does', async () => {
  const { ceiling } = await setup();
  const two = { twoReturns: true, shareA: 0.5 };
  // A over its 62,600 line, B not on the marketplace: no cap.
  expect(ceiling({ ...two, acaEligibleB: false, preConvMagi: 100000, preMagiA: 100000, preMagiB: 0 })).toBe(Infinity);
  // A over, B under at 40,000: B's room (62,600 - 40,000) / 0.5 = 45,200 above the household's 100,000.
  expect(ceiling({ ...two, preConvMagi: 140000, preMagiA: 100000, preMagiB: 40000 })).toBe(185200);
});
